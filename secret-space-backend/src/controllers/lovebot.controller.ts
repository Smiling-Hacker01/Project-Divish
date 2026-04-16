import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { updateLoveBotSettingsSchema, addReasonSchema } from '../utils/validators';

// ── GET /api/lovebot/settings ──────────────────────────────────────────────────
export const getSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;

    const couple = await prisma.couple.findUnique({
      where: { id: coupleId },
      select: {
        userALoveBotMode: true,
        userALoveBotTime: true,
        userBAccessGranted: true,
        userBLoveBotMode: true,
        userBLoveBotTime: true,
        userAId: true,
      },
    });

    if (!couple) {
      res.status(404).json({ error: 'Couple not found' });
      return;
    }

    // Get all unused AND used reasons added by THIS user
    const reasons = await prisma.loveReason.findMany({
      where: { coupleId, authorId: userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, reason: true, forUserId: true, createdAt: true },
    });

    const isCreator = couple.userAId === userId;
    
    // We send back "mode" and "time" to match what the frontend understands for the current user
    const mode = isCreator ? couple.userALoveBotMode : couple.userBLoveBotMode;
    const time = isCreator ? couple.userALoveBotTime : couple.userBLoveBotTime;

    res.json({
      mode,
      time,
      isCreator,
      userBAccessGranted: couple.userBAccessGranted,
      reasons: reasons.map((r) => ({
        id: r.id,
        text: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/lovebot/settings ──────────────────────────────────────────────────
// Only User A (creator) can update settings
export const updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = updateLoveBotSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { mode, time, userBAccessGranted } = parsed.data;
    const coupleId = req.coupleId!;

    if (req.isCreator) {
      await prisma.couple.update({
        where: { id: coupleId },
        data: {
          userALoveBotMode: mode,
          userALoveBotTime: time,
          ...(userBAccessGranted !== undefined && { userBAccessGranted }),
        },
      });
    } else {
      // Security Check: If User B tries to update this, ensure they actually have access
      const couple = await prisma.couple.findUnique({ where: { id: coupleId }, select: { userBAccessGranted: true } });
      if (!couple?.userBAccessGranted) {
         res.status(403).json({ error: 'You are not authorized to use the LoverBot feature.' });
         return;
      }
      await prisma.couple.update({
        where: { id: coupleId },
        data: {
          userBLoveBotMode: mode,
          userBLoveBotTime: time,
        },
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/lovebot/reasons ──────────────────────────────────────────────────
// Any couple member can add a reason for themselves or their partner
export const addReason = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = addReasonSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { text, forPartner } = parsed.data;
    const coupleId = req.coupleId!;
    
    // If they want to send it to the partner, they must have one. Otherwise, it goes to themselves.
    const targetUserId = forPartner ? req.partnerId : req.user!.userId;

    if (!targetUserId) {
      res.status(400).json({ error: 'Your partner has not joined yet, so you cannot send reasons to them.' });
      return;
    }

    const reason = await prisma.loveReason.create({
      data: {
        reason: text,
        coupleId,
        authorId: req.user!.userId,
        forUserId: targetUserId,
      },
    });

    res.status(201).json({
      id: reason.id,
      text: reason.reason,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/lovebot/reasons/:id ────────────────────────────────────────────
export const deleteReason = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupleId = req.coupleId!;
    const { id } = req.params;

    const reason = await prisma.loveReason.findFirst({ where: { id, coupleId, authorId: req.user!.userId } });
    if (!reason) {
      res.status(404).json({ error: 'Reason not found or you lack permission to delete it' });
      return;
    }

    await prisma.loveReason.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
