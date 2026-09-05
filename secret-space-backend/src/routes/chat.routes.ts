import { Request, Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import prisma from '../config/prisma';
import { z } from 'zod';
import logger from '../config/logger';
import { uploadBase64, uploadBuffer } from '../services/storage.service';
import { chatUpload } from '../middlewares/chatUpload';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

const router = Router();

const ATTACHMENT_KIND = z.enum(['image', 'video', 'audio', 'file']);

const deviceRegistrationSchema = z.object({
  deviceId: z.string().uuid(),
  publicKey: z.string().min(32).max(10000),
  keyVersion: z.number().int().positive(),
  name: z.string().trim().min(1).max(100).optional(),
});

const deviceIdFromRequest = (req: Request): string | null => {
  const value = req.header('x-device-id');
  return value && z.string().uuid().safeParse(value).success ? value : null;
};

const deviceSelect = {
  id: true,
  userId: true,
  status: true,
  name: true,
  createdAt: true,
  lastSeenAt: true,
  revokedAt: true,
} as const;

async function ownedDevice(req: Request, requireActive = false) {
  const deviceId = deviceIdFromRequest(req);
  if (!deviceId) return null;
  return prisma.device.findFirst({
    where: {
      id: deviceId,
      userId: req.user!.userId,
      ...(requireActive ? { status: 'active', revokedAt: null } : {}),
    },
    select: deviceSelect,
  });
}

const hashPairingToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

// Registering a device never activates it. Activation requires the separate
// trusted-device pairing/recovery flow implemented after registration.
router.post('/devices', verifyJWT, async (req, res) => {
  try {
    const payload = deviceRegistrationSchema.parse(req.body);
    const userId = req.user!.userId;
    const existing = await prisma.device.findUnique({ where: { id: payload.deviceId } });
    if (existing && existing.userId !== userId) {
      res.status(409).json({ error: 'Device is already registered to another account' });
      return;
    }

    const device = existing
      ? await prisma.$transaction(async (tx) => {
          await tx.deviceKey.upsert({
            where: { deviceId_keyVersion: { deviceId: payload.deviceId, keyVersion: payload.keyVersion } },
            create: { deviceId: payload.deviceId, publicKey: payload.publicKey, keyVersion: payload.keyVersion },
            update: { publicKey: payload.publicKey, revokedAt: null },
          });
          return tx.device.update({
            where: { id: payload.deviceId },
            data: { name: payload.name, lastSeenAt: new Date() },
            select: { id: true, status: true, name: true, createdAt: true, lastSeenAt: true },
          });
        })
      : await prisma.device.create({
          data: {
            id: payload.deviceId,
            userId,
            name: payload.name,
            keys: { create: { publicKey: payload.publicKey, keyVersion: payload.keyVersion } },
          },
          select: { id: true, status: true, name: true, createdAt: true, lastSeenAt: true },
        });

    res.status(existing ? 200 : 201).json({ device });
  } catch (err: any) {
    logger.error({ err: err?.message, userId: req.user?.userId }, '[ChatApi] Device registration failed');
    res.status(400).json({ error: 'Invalid device registration' });
  }
});

router.get('/devices', verifyJWT, async (req, res) => {
  const devices = await prisma.device.findMany({
    where: { userId: req.user!.userId },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      lastSeenAt: true,
      revokedAt: true,
      keys: { where: { revokedAt: null }, orderBy: { keyVersion: 'desc' }, take: 1, select: { keyVersion: true, publicKey: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ devices });
});

// The first trusted installation is bootstrapped explicitly by the signed-in user.
// Later installations must use the pairing challenge flow below and can never use
// this endpoint once an active device exists.
router.post('/devices/bootstrap', verifyJWT, async (req, res) => {
  const device = await ownedDevice(req);
  if (!device) {
    res.status(400).json({ error: 'A valid X-Device-Id is required' });
    return;
  }
  const activeCount = await prisma.device.count({
    where: { userId: req.user!.userId, status: 'active', revokedAt: null },
  });
  if (activeCount > 0 && device.status !== 'active') {
    res.status(409).json({ error: 'Device requires approval by an active device' });
    return;
  }
  const updated = await prisma.device.update({
    where: { id: device.id },
    data: { status: 'active', revokedAt: null, lastSeenAt: new Date() },
    select: deviceSelect,
  });
  res.json({ device: updated });
});

// A pending device receives a short-lived, single-use token. The token itself is
// returned only to that device; only its SHA-256 digest is stored server-side.
router.post('/devices/pairing-challenges', verifyJWT, async (req, res) => {
  const device = await ownedDevice(req);
  if (!device || device.status !== 'pending' || device.revokedAt) {
    res.status(403).json({ error: 'Only a pending device can request pairing' });
    return;
  }
  const active = await prisma.device.findFirst({
    where: { userId: req.user!.userId, status: 'active', revokedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!active) {
    res.status(409).json({ error: 'No active device is available to approve pairing' });
    return;
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await prisma.pairingChallenge.create({
    data: {
      creatorDeviceId: device.id,
      targetDeviceId: device.id,
      tokenHash: hashPairingToken(token),
      expiresAt,
    },
  });
  res.status(201).json({
    challenge: { token, expiresAt: expiresAt.toISOString(), deviceId: device.id },
  });
});

// Approval requires a currently active device belonging to the same account. The
// conditional update makes approval single-use under concurrent/replayed requests.
router.post('/devices/pairing-approvals', verifyJWT, async (req, res) => {
  const approver = await ownedDevice(req, true);
  const parsed = z.object({ token: z.string().min(20).max(200) }).safeParse(req.body);
  if (!approver || !parsed.success) {
    res.status(400).json({ error: 'Active device and valid pairing token are required' });
    return;
  }
  const now = new Date();
  const tokenHash = hashPairingToken(parsed.data.token);
  const challenge = await prisma.pairingChallenge.findUnique({ where: { tokenHash } });
  if (!challenge || challenge.expiresAt <= now) {
    res.status(410).json({ error: 'Pairing challenge expired or invalid' });
    return;
  }
  const target = await prisma.device.findFirst({
    where: { id: challenge.targetDeviceId, userId: req.user!.userId },
    select: deviceSelect,
  });
  if (!target || target.status === 'revoked' || target.revokedAt) {
    res.status(403).json({ error: 'Target device is not eligible for pairing' });
    return;
  }
  if (target.status === 'active') {
    res.json({ device: target, alreadyActive: true });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const consumed = await tx.pairingChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return null;
    return tx.device.update({
      where: { id: target.id },
      data: { status: 'active', lastSeenAt: now },
      select: deviceSelect,
    });
  });
  if (!updated) {
    res.status(409).json({ error: 'Pairing challenge has already been used' });
    return;
  }
  res.json({ device: updated, alreadyActive: false });
});

router.post('/devices/:deviceId/revoke', verifyJWT, async (req, res) => {
  const approver = await ownedDevice(req, true);
  if (!approver || approver.id === req.params.deviceId) {
    res.status(403).json({ error: 'An active device must revoke another device' });
    return;
  }
  const target = await prisma.device.findFirst({
    where: { id: req.params.deviceId, userId: req.user!.userId },
    select: { id: true, status: true },
  });
  if (!target) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  const revoked = await prisma.$transaction(async (tx) => {
    const device = await tx.device.update({
      where: { id: target.id },
      data: { status: 'revoked', revokedAt: new Date() },
      select: deviceSelect,
    });
    await tx.deviceKey.updateMany({ where: { deviceId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return device;
  });
  res.json({ device: revoked });
});

const epochSchema = z.object({
  requestId: z.string().uuid(),
  envelopes: z.array(z.object({
    deviceId: z.string().uuid(),
    keyVersion: z.number().int().positive(),
    wrappedEpochKey: z.string().min(1).max(20000),
  })).min(1).max(20),
});

// Creates one current epoch from client-generated, client-wrapped key material. The
// server assigns the monotonically increasing version and stores only opaque envelopes.
router.post('/epochs', verifyJWT, async (req, res) => {
  const creator = await ownedDevice(req, true);
  const parsed = epochSchema.safeParse(req.body);
  if (!creator || !parsed.success) {
    res.status(400).json({ error: 'Active device and valid epoch payload are required' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { coupleAsA: { select: { id: true, userAId: true, userBId: true } }, coupleAsB: { select: { id: true, userAId: true, userBId: true } } },
  });
  const couple = user?.coupleAsA ?? user?.coupleAsB;
  if (!couple?.userBId) {
    res.status(409).json({ error: 'An active couple is required' });
    return;
  }
  const activeDevices = await prisma.device.findMany({
    where: { userId: { in: [couple.userAId, couple.userBId] }, status: 'active', revokedAt: null },
    select: { id: true },
  });
  const activeIds = new Set(activeDevices.map((d) => d.id));
  const uniqueIds = new Set(parsed.data.envelopes.map((e) => e.deviceId));
  if (uniqueIds.size !== activeIds.size || [...activeIds].some((id) => !uniqueIds.has(id))) {
    res.status(422).json({ error: 'An envelope is required for every active couple device' });
    return;
  }

  const existing = await prisma.conversationKeyEpoch.findFirst({
    where: { coupleId: couple.id, creationRequestId: parsed.data.requestId },
    include: { envelopes: { where: { deviceId: creator.id } } },
  });
  if (existing) {
    res.json({ epoch: existing });
    return;
  }

  try {
    const epoch = await prisma.$transaction(async (tx) => {
      await tx.conversationKeyEpoch.updateMany({
        where: { coupleId: couple.id, status: 'active' },
        data: { status: 'retired', retiredAt: new Date() },
      });
      const latest = await tx.conversationKeyEpoch.findFirst({
        where: { coupleId: couple.id }, orderBy: { version: 'desc' }, select: { version: true },
      });
      return tx.conversationKeyEpoch.create({
        data: {
          coupleId: couple.id,
          version: (latest?.version ?? 0) + 1,
          creationRequestId: parsed.data.requestId,
          status: 'active',
          envelopes: { create: parsed.data.envelopes },
        },
        include: { envelopes: { where: { deviceId: creator.id } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json({ epoch });
  } catch (err: any) {
    logger.error({ err: err?.message, coupleId: couple.id }, '[ChatApi] Epoch creation failed');
    res.status(409).json({ error: 'Epoch creation conflicted; retry with the same requestId' });
  }
});

// Returns only envelopes addressed to the authenticated active device. Wrapped key
// material is opaque to this API and is never returned for another device.
router.get('/epochs/envelopes', verifyJWT, async (req, res) => {
  const device = await ownedDevice(req, true);
  if (!device) {
    res.status(403).json({ error: 'Active device is required' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { coupleAsA: { select: { id: true } }, coupleAsB: { select: { id: true } } },
  });
  const coupleId = user?.coupleAsA?.id ?? user?.coupleAsB?.id;
  if (!coupleId) {
    res.status(404).json({ error: 'No active couple found' });
    return;
  }
  const envelopes = await prisma.conversationDeviceEnvelope.findMany({
    where: { deviceId: device.id, epoch: { coupleId } },
    select: { epoch: { select: { version: true, status: true } }, keyVersion: true, wrappedEpochKey: true, createdAt: true },
    orderBy: { epoch: { version: 'asc' } },
  });
  res.json({ envelopes });
});

// Active clients need public keys for every authorized device before creating an
// epoch. Public keys are not secret; private keys and wrapped epoch keys remain
// device-local/opaque. Pending and revoked devices are intentionally excluded.
router.get('/epochs/recipients', verifyJWT, async (req, res) => {
  const device = await ownedDevice(req, true);
  if (!device) {
    res.status(403).json({ error: 'Active device is required' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { coupleAsA: { select: { id: true, userAId: true, userBId: true } }, coupleAsB: { select: { id: true, userAId: true, userBId: true } } },
  });
  const couple = user?.coupleAsA ?? user?.coupleAsB;
  if (!couple?.userBId) {
    res.status(404).json({ error: 'No active couple found' });
    return;
  }
  const recipients = await prisma.device.findMany({
    where: { userId: { in: [couple.userAId, couple.userBId] }, status: 'active', revokedAt: null },
    select: {
      id: true,
      userId: true,
      keys: {
        where: { revokedAt: null },
        orderBy: { keyVersion: 'desc' },
        take: 1,
        select: { publicKey: true, keyVersion: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    recipients: recipients
      .filter((recipient) => recipient.keys.length > 0)
      .map((recipient) => ({ id: recipient.id, userId: recipient.userId, ...recipient.keys[0] })),
  });
});

const envelopeSchema = z.object({
  deviceId: z.string().uuid(),
  keyVersion: z.number().int().positive(),
  wrappedEpochKey: z.string().min(1).max(20000),
});

// An authorized client submits one opaque envelope for an already-created epoch.
// The unique (epochId, deviceId) constraint makes retries safe and prevents a
// second envelope from replacing the original key material.
router.post('/epochs/:epochVersion/envelopes', verifyJWT, async (req, res) => {
  const creator = await ownedDevice(req, true);
  const version = Number(req.params.epochVersion);
  const parsed = envelopeSchema.safeParse(req.body);
  if (!creator || !Number.isInteger(version) || version < 1 || !parsed.success) {
    res.status(400).json({ error: 'Active device and valid envelope are required' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { coupleAsA: { select: { id: true, userAId: true, userBId: true } }, coupleAsB: { select: { id: true, userAId: true, userBId: true } } },
  });
  const couple = user?.coupleAsA ?? user?.coupleAsB;
  if (!couple?.userBId) {
    res.status(404).json({ error: 'No active couple found' });
    return;
  }
  const [epoch, target] = await Promise.all([
    prisma.conversationKeyEpoch.findUnique({
      where: { coupleId_version: { coupleId: couple.id, version } },
      select: { id: true, status: true, envelopes: { where: { deviceId: creator.id }, select: { id: true } } },
    }),
    prisma.device.findFirst({
      where: { id: parsed.data.deviceId, userId: { in: [couple.userAId, couple.userBId] }, status: 'active', revokedAt: null },
      select: { id: true, userId: true, keys: { where: { keyVersion: parsed.data.keyVersion, revokedAt: null }, select: { id: true } } },
    }),
  ]);
  if (!epoch || epoch.envelopes.length !== 1 || !target || target.keys.length !== 1) {
    res.status(422).json({ error: 'Epoch, target device, or key version is invalid' });
    return;
  }
  const existingEnvelope = await prisma.conversationDeviceEnvelope.findUnique({
    where: { epochId_deviceId: { epochId: epoch.id, deviceId: target.id } },
    select: { id: true },
  });
  const result = await prisma.conversationDeviceEnvelope.upsert({
    where: { epochId_deviceId: { epochId: epoch.id, deviceId: target.id } },
    create: { epochId: epoch.id, deviceId: target.id, keyVersion: parsed.data.keyVersion, wrappedEpochKey: parsed.data.wrappedEpochKey },
    update: {},
    select: { id: true, epochId: true, deviceId: true, keyVersion: true, createdAt: true },
  });
  res.status(200).json({ envelope: result, alreadyExisted: Boolean(existingEnvelope) });
});

// Gives an active client a deterministic work list. It returns public keys only;
// the client decides whether it has the corresponding epoch key to wrap locally.
router.get('/epochs/distribution-status', verifyJWT, async (req, res) => {
  const creator = await ownedDevice(req, true);
  if (!creator) {
    res.status(403).json({ error: 'Active device is required' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { coupleAsA: { select: { id: true, userAId: true, userBId: true } }, coupleAsB: { select: { id: true, userAId: true, userBId: true } } },
  });
  const couple = user?.coupleAsA ?? user?.coupleAsB;
  if (!couple?.userBId) {
    res.status(404).json({ error: 'No active couple found' });
    return;
  }
  const [epochs, devices] = await Promise.all([
    prisma.conversationKeyEpoch.findMany({ where: { coupleId: couple.id }, orderBy: { version: 'asc' }, select: { version: true, status: true, envelopes: { select: { deviceId: true } } } }),
    prisma.device.findMany({ where: { userId: { in: [couple.userAId, couple.userBId] }, status: 'active', revokedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, userId: true, keys: { where: { revokedAt: null }, orderBy: { keyVersion: 'desc' }, take: 1, select: { keyVersion: true, publicKey: true } } } }),
  ]);
  const activeDeviceIds = new Set(devices.map((device) => device.id));
  res.json({
    epochs: epochs.map((epoch) => ({
      version: epoch.version,
      status: epoch.status,
      missingDevices: devices
        .filter((device) => !epoch.envelopes.some((envelope) => envelope.deviceId === device.id) && device.keys.length > 0)
        .map((device) => ({ id: device.id, userId: device.userId, ...device.keys[0] })),
      envelopeDeviceIds: epoch.envelopes.map((envelope) => envelope.deviceId).filter((id) => activeDeviceIds.has(id)),
    })),
  });
});

// POST /api/chat/upload — accept a base64 attachment (image / video / audio / file)
// and return its Cloudinary URL so the client can include it in `send_message` over the socket.
// Kept for images and audio where base64 is cheap. For video, prefer `/upload-multipart`.
router.post('/upload', verifyJWT, async (req, res) => {
  try {
    const schema = z.object({
      // accepts both raw base64 and `data:...;base64,...` data URLs
      data: z.string().min(1),
      kind: ATTACHMENT_KIND,
    });
    const { data, kind } = schema.parse(req.body);

    const uploaded = await uploadBase64(data, `chat/${kind}`);
    res.json({ url: uploaded.url, kind });
  } catch (err: any) {
    logger.error({ err }, '[ChatApi] Failed to upload chat attachment');
    res.status(400).json({ error: 'Invalid upload payload' });
  }
});

// POST /api/chat/upload-multipart — true multipart upload, used by the mobile client
// for video (and any large file) so the bytes never have to be base64-encoded across the
// React Native bridge. The form must include a `file` field and a `kind` text field.
router.post('/upload-multipart', verifyJWT, chatUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Missing file in form-data field "file"' });
      return;
    }
    const kindParse = ATTACHMENT_KIND.safeParse(req.body?.kind);
    if (!kindParse.success) {
      res.status(400).json({ error: 'Invalid or missing "kind" field' });
      return;
    }
    const kind = kindParse.data;

    const uploaded = await uploadBuffer(req.file.buffer, `chat/${kind}`);
    res.json({ url: uploaded.url, kind });
  } catch (err: any) {
    logger.error({ err: err?.message }, '[ChatApi] Multipart upload failed');
    res.status(400).json({ error: err?.message ?? 'Upload failed' });
  }
});

// PUT /api/chat/keys - Upload user's public key
router.put('/keys', verifyJWT, async (req, res) => {
  try {
    const schema = z.object({
      publicKey: z.string(),
    });
    const { publicKey } = schema.parse(req.body);

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { publicKey },
    });

    res.json({ message: 'Public key updated' });
  } catch (err: any) {
    logger.error({ err }, '[ChatApi] Failed to upload public key');
    res.status(400).json({ error: 'Invalid payload' });
  }
});

// GET /api/chat/keys/:partnerId - Get partner's public key
router.get('/keys/:partnerId', verifyJWT, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.partnerId },
      select: { publicKey: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ publicKey: user.publicKey });
  } catch (err: any) {
    logger.error({ err }, '[ChatApi] Failed to fetch partner public key');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/chat/history - Paginated conversation history
router.get('/history', verifyJWT, async (req, res) => {
  try {
    const userId = req.user!.userId;
    // Find active couple
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { coupleAsA: true, coupleAsB: true }
    });

    const couple = user?.coupleAsA || user?.coupleAsB;
    if (!couple) {
      return res.status(404).json({ error: 'No active couple found' });
    }

    // Pagination cursor
    const cursor = req.query.cursor as string | undefined;
    const take = 50;

    const messages = await prisma.message.findMany({
      where: { coupleId: couple.id },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { sender: { select: { id: true, name: true } } }
    });

    let nextCursor: string | undefined = undefined;
    if (messages.length > take) {
      const nextItem = messages.pop();
      nextCursor = nextItem!.id;
    }

    res.json({ messages, nextCursor });
  } catch (err: any) {
    logger.error({ err }, '[ChatApi] Failed to fetch chat history');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/chat/unread-count — number of messages the current user has not yet read.
// The mobile client uses this on bootstrap; live updates come from the socket.
router.get('/unread-count', verifyJWT, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { coupleAsA: { select: { id: true } }, coupleAsB: { select: { id: true } } },
    });
    const coupleId = user?.coupleAsA?.id ?? user?.coupleAsB?.id;
    if (!coupleId) {
      res.json({ count: 0 });
      return;
    }
    const count = await prisma.message.count({
      where: {
        coupleId,
        senderId: { not: userId },
        status: { in: ['sent', 'delivered'] },
        deletedForEveryone: false,
      },
    });
    res.json({ count });
  } catch (err: any) {
    logger.error({ err: err?.message }, '[ChatApi] Failed to fetch unread count');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
