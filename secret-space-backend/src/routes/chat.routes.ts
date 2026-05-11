import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import prisma from '../config/prisma';
import { z } from 'zod';
import logger from '../config/logger';

const router = Router();

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
      orderBy: { createdAt: 'desc' },
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

export default router;
