import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { upsertMoodSchema } from '../utils/validators';

// ── POST /api/mood ─────────────────────────────────────────────────────────────
export const upsertMood = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = upsertMoodSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { mood } = parsed.data;
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;

    await prisma.mood.upsert({
      where: { coupleId_userId: { coupleId, userId } },
      create: { coupleId, userId, mood },
      update: { mood },
    });

    res.json({ success: true, mood });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/mood ──────────────────────────────────────────────────────────────
export const getCoupleMoods = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;

    const moods = await prisma.mood.findMany({
      where: { coupleId },
      select: { userId: true, mood: true, updatedAt: true },
    });

    const myMood = moods.find((m) => m.userId === userId);
    const partnerMood = moods.find((m) => m.userId !== userId);

    res.json({
      myMood: myMood?.mood || null,
      partnerMood: partnerMood?.mood || null,
    });
  } catch (err) {
    next(err);
  }
};
