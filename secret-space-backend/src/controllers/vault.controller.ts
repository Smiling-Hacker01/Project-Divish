import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../config/prisma';
import redis from '../config/redis';
import logger from '../config/logger';
import { uploadBuffer, deleteFile } from '../services/storage.service';
import { VAULT_LIMITS } from '../middlewares/vaultUpload';

const VAULT_TOKEN_TTL = 5 * 60; // 5 minutes

// ── Helpers ────────────────────────────────────────────────────────────────────

// Cloudinary URL → publicId. Used to drop orphans on DB-write failure and to delete
// assets on item delete. Tolerates the per-user subfolders we now write into.
const publicIdFromCloudinaryUrl = (url: string): string | null => {
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
  return m ? m[1] : null;
};

// Derived video poster URL via Cloudinary's `so_0,f_jpg` transformation. No extra
// storage cost — the JPEG is generated on first hit and cached by their CDN.
const videoPosterUrl = (videoUrl: string): string | null => {
  const m = videoUrl.match(/^(https?:\/\/[^/]+\/[^/]+\/video\/upload\/)(.+)\.(mp4|mov|webm)$/i);
  if (!m) return null;
  return `${m[1]}so_0,f_jpg/${m[2]}.jpg`;
};

// Owner cohort: the calling user + their partner (if any). Vault visibility is a
// shared-by-couple model — either partner sees the union of both libraries once
// they unlock.
const ownerCohortFor = async (userId: string): Promise<string[]> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { coupleAsA: true, coupleAsB: true },
  });
  const ids = new Set<string>([userId]);
  const couple = user?.coupleAsA || user?.coupleAsB;
  if (couple) {
    if (couple.userAId) ids.add(couple.userAId);
    if (couple.userBId) ids.add(couple.userBId);
  }
  return Array.from(ids);
};

// Sliding TTL: every authenticated vault call refreshes the token's expiry so an
// active user isn't kicked back to the unlock screen mid-browse. Called from inside
// the controller (not the middleware) so we only extend on successful business ops.
const extendVaultToken = (token: string): Promise<void> =>
  redis.expire(`vault:${token}`, VAULT_TOKEN_TTL).then(() => undefined);

// Build the API-facing item shape. `type: 'photo' | 'video'` is kept for back-compat
// with existing mobile code; the new `thumbnailUrl` field is now reliably populated.
const serializeItem = (item: {
  id: string;
  fileUrl: string;
  fileType: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  ownerId: string;
}) => ({
  id: item.id,
  type: item.fileType === 'image' ? ('photo' as const) : ('video' as const),
  url: item.fileUrl,
  thumbnailUrl:
    item.thumbnailUrl ?? (item.fileType === 'video' ? videoPosterUrl(item.fileUrl) : item.fileUrl),
  ownerId: item.ownerId,
  timestamp: item.createdAt.toISOString(),
});

// ── POST /api/vault/unlock ─────────────────────────────────────────────────────
// Issues a short-lived vault session token after frontend biometric verification.
// Password fallback is verified server-side; biometric is trusted from native after
// LocalAuthentication returns success.
export const unlockVault = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { password } = req.body;

    if (password) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: 'Incorrect password' });
        return;
      }
    }

    const token = crypto.randomUUID();
    await redis.set(`vault:${token}`, userId, 'EX', VAULT_TOKEN_TTL);

    logger.info({ userId }, '[Vault] Session token issued');
    res.json({ success: true, token });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/vault/upload ─────────────────────────────────────────────────────
// True multipart endpoint. Mobile uploads files directly via FileSystem.uploadAsync
// so the bytes never have to be base64-encoded across the React Native bridge. Returns
// the Cloudinary URL the client then posts back to POST /api/vault.
export const uploadMedia = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Missing file in form-data field "file"' });
      return;
    }
    const declaredType = req.body?.type;
    if (declaredType !== 'image' && declaredType !== 'video') {
      res.status(400).json({ error: 'type must be "image" or "video"' });
      return;
    }
    const mime = req.file.mimetype;
    if (declaredType === 'image' && !VAULT_LIMITS.ALLOWED_IMAGE.has(mime)) {
      res.status(400).json({ error: `Unsupported image MIME: ${mime}` });
      return;
    }
    if (declaredType === 'video' && !VAULT_LIMITS.ALLOWED_VIDEO.has(mime)) {
      res.status(400).json({ error: `Unsupported video MIME: ${mime}` });
      return;
    }
    // Tighter image-only cap; videos already enforced by multer's global limit.
    if (declaredType === 'image' && req.file.size > VAULT_LIMITS.MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'Image exceeds 40 MB limit' });
      return;
    }

    // Per-owner folder makes URL provenance auditable and keeps Cloudinary's namespace
    // organised: secret-space/vault/<ownerId>/<random>.
    const userId = req.user!.userId;
    const uploaded = await uploadBuffer(req.file.buffer, `vault/${userId}`);
    const thumbnailUrl =
      declaredType === 'video' ? videoPosterUrl(uploaded.url) ?? undefined : undefined;

    // Sliding TTL refresh on every upload — active users won't get kicked.
    const vaultToken = req.headers['x-vault-token'] as string;
    if (vaultToken) extendVaultToken(vaultToken).catch(() => undefined);

    res.json({ url: uploaded.url, thumbnailUrl, type: declaredType });
  } catch (err: any) {
    logger.error({ err: err?.message }, '[Vault] Multipart upload failed');
    res.status(400).json({ error: err?.message ?? 'Upload failed' });
  }
};

// ── GET /api/vault ─────────────────────────────────────────────────────────────
// Cursor-paginated. Page size capped at 60. Returns the union of the user + their
// partner's owned items in chronological-desc order.
export const getItems = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const ownerIds = await ownerCohortFor(userId);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limit = Math.min(60, Math.max(1, Number(req.query.limit ?? 30)));

    const items = await prisma.vaultFile.findMany({
      where: { ownerId: { in: ownerIds } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const last = items.pop()!;
      nextCursor = last.id;
    }

    const vaultToken = req.headers['x-vault-token'] as string;
    if (vaultToken) extendVaultToken(vaultToken).catch(() => undefined);

    res.json({ items: items.map(serializeItem), nextCursor });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/vault ────────────────────────────────────────────────────────────
// Accepts a Cloudinary URL produced by POST /api/vault/upload. The legacy
// base64-in-fileData path is gone — clients must upload first, then create.
// Idempotent on (ownerId, clientId) for retry-queue safety.
export const createItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const body = req.body ?? {};

    if (body.fileType !== 'image' && body.fileType !== 'video') {
      res.status(400).json({ error: 'fileType must be "image" or "video"' });
      return;
    }
    if (typeof body.fileUrl !== 'string' || !/^https?:\/\//i.test(body.fileUrl)) {
      res.status(400).json({ error: 'fileUrl must be a valid URL — upload via /api/vault/upload first' });
      return;
    }
    const clientId = typeof body.clientId === 'string' ? body.clientId : null;

    // Idempotency fast-path: the retry queue replays with the same clientId; the
    // unique index makes the second insert a no-op and we return the existing row.
    let item;
    let isReplay = false;
    if (clientId) {
      const existing = await prisma.vaultFile.findUnique({
        where: { vault_owner_client_id_unique: { ownerId: userId, clientId } },
      });
      if (existing) {
        item = existing;
        isReplay = true;
      }
    }

    if (!item) {
      try {
        item = await prisma.vaultFile.create({
          data: {
            ownerId: userId,
            clientId,
            fileUrl: body.fileUrl,
            fileType: body.fileType,
            thumbnailUrl:
              body.thumbnailUrl ??
              (body.fileType === 'image' ? body.fileUrl : videoPosterUrl(body.fileUrl)),
          },
        });
      } catch (err) {
        // DB-write failure: drop the orphaned Cloudinary asset before bubbling up.
        const publicId = publicIdFromCloudinaryUrl(body.fileUrl);
        if (publicId) deleteFile(publicId).catch(() => undefined);
        throw err;
      }
    }

    const vaultToken = req.headers['x-vault-token'] as string;
    if (vaultToken) extendVaultToken(vaultToken).catch(() => undefined);

    if (isReplay) {
      res.status(200).json(serializeItem(item));
    } else {
      res.status(201).json(serializeItem(item));
    }
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/vault/:id ──────────────────────────────────────────────────────
// Either partner can delete any item in the shared cohort. Cloudinary asset is
// dropped best-effort — non-critical for app correctness, important for cost.
export const deleteItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const ownerIds = await ownerCohortFor(userId);

    const item = await prisma.vaultFile.findFirst({
      where: { id, ownerId: { in: ownerIds } },
    });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const publicId = publicIdFromCloudinaryUrl(item.fileUrl);
    if (publicId) {
      deleteFile(publicId).catch((err) =>
        logger.warn({ err: err?.message, id }, '[Vault] Cloudinary delete failed (non-fatal)')
      );
    }

    await prisma.vaultFile.delete({ where: { id } });

    const vaultToken = req.headers['x-vault-token'] as string;
    if (vaultToken) extendVaultToken(vaultToken).catch(() => undefined);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
