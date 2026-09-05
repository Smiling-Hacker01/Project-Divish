import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import prisma from '../config/prisma';
import { z } from 'zod';
import logger from '../config/logger';
import { uploadBase64, uploadBuffer } from '../services/storage.service';
import { chatUpload } from '../middlewares/chatUpload';

const router = Router();

const ATTACHMENT_KIND = z.enum(['image', 'video', 'audio', 'file']);

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
