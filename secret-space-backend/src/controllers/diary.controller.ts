import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import logger from '../config/logger';
import { uploadBase64 } from '../services/storage.service';
import {
  createDiarySchema,
  likeEntrySchema,
  addCommentSchema,
} from '../utils/validators';

// ── GET /api/diary ─────────────────────────────────────────────────────────────
export const getEntries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;

    const entries = await prisma.diaryEntry.findMany({
      where: { coupleId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true } },
        reactions: {
          select: { type: true, userId: true },
        },
      },
    });

    const mapped = entries.map((entry) => {
      const likes = entry.reactions.filter((r) => r.type === 'heart').length;
      const comments = entry.reactions.filter((r) => r.type === 'comment').length;
      return {
        id: entry.id,
        author: entry.authorId === userId ? 'you' : 'partner',
        type: entry.type,
        content: entry.content || entry.mediaUrl || '',
        timestamp: entry.createdAt.toISOString(),
        likes,
        comments,
      };
    });

    res.json(mapped);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/diary/:id ─────────────────────────────────────────────────────────
export const getEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;
    const { id } = req.params;

    const entry = await prisma.diaryEntry.findFirst({
      where: { id, coupleId },
      include: {
        author: { select: { id: true, name: true } },
        reactions: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    const likes = entry.reactions.filter((r) => r.type === 'heart').length;
    const commentsList = entry.reactions
      .filter((r) => r.type === 'comment')
      .map((r) => ({
        author: r.userId === userId ? 'You' : r.user.name,
        text: r.commentText || '',
        timestamp: r.createdAt.toISOString(),
      }));

    res.json({
      id: entry.id,
      author: entry.authorId === userId ? 'you' : 'partner',
      type: entry.type,
      content: entry.content || entry.mediaUrl || '',
      timestamp: entry.createdAt.toISOString(),
      likes,
      comments: commentsList.length,
      commentsList,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/diary ────────────────────────────────────────────────────────────
export const createEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = createDiarySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { type, content, mediaUrl } = parsed.data;
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;

    let finalMediaUrl = mediaUrl;
    // If media is base64, upload it
    if (type !== 'text' && content && content.length > 200) {
      const result = await uploadBase64(content, 'diary');
      finalMediaUrl = result.url;
    }

    const entry = await prisma.diaryEntry.create({
      data: {
        coupleId,
        authorId: userId,
        type,
        content: type === 'text' ? content : null,
        mediaUrl: finalMediaUrl,
      },
    });

    res.status(201).json({
      id: entry.id,
      author: 'you',
      type: entry.type,
      content: entry.content || entry.mediaUrl || '',
      timestamp: entry.createdAt.toISOString(),
      likes: 0,
      comments: 0,
      commentsList: [],
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/diary/:id/like ───────────────────────────────────────────────────
export const likeEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = likeEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { liked } = parsed.data;
    const userId = req.user!.userId;
    const { id } = req.params;
    const coupleId = req.coupleId!;

    // Verify entry belongs to couple
    const entry = await prisma.diaryEntry.findFirst({ where: { id, coupleId } });
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    if (liked) {
      // Upsert: prevent duplicate hearts from same user
      const existing = await prisma.diaryReaction.findFirst({
        where: { entryId: id, userId, type: 'heart' },
      });
      if (!existing) {
        await prisma.diaryReaction.create({
          data: { entryId: id, userId, type: 'heart' },
        });
      }
    } else {
      await prisma.diaryReaction.deleteMany({
        where: { entryId: id, userId, type: 'heart' },
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/diary/:id/comments ───────────────────────────────────────────────
export const addComment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = addCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { text } = parsed.data;
    const userId = req.user!.userId;
    const { id } = req.params;
    const coupleId = req.coupleId!;

    // Verify entry belongs to couple
    const entry = await prisma.diaryEntry.findFirst({ where: { id, coupleId } });
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    await prisma.diaryReaction.create({
      data: { entryId: id, userId, type: 'comment', commentText: text },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/diary/:id ──────────────────────────────────────────────────────
export const deleteEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const coupleId = req.coupleId!;

    const entry = await prisma.diaryEntry.findFirst({ where: { id, coupleId } });
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    if (entry.authorId !== userId) {
      res.status(403).json({ error: 'You can only delete your own entries' });
      return;
    }

    await prisma.diaryEntry.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
