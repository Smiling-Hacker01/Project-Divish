import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import logger from '../config/logger';
import { updateProfileSchema } from '../utils/validators';

// ── GET /api/settings/profile ──────────────────────────────────────────────────
export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get couple info
    const couple = await prisma.couple.findFirst({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: {
        coupleCode: true,
        userAId: true,
        userBId: true,
        anniversaryDate: true,
        status: true,
      },
    });

    const isCreator = couple?.userAId === userId;
    const hasFace = !!(await prisma.faceDescriptor.findUnique({ where: { userId } }));

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        coupleCode: couple?.coupleCode,
        isCreator,
        partnerId: isCreator ? couple?.userBId : couple?.userAId,
        faceMFAEnabled: hasFace,
        anniversaryDate: couple?.anniversaryDate?.toISOString().split('T')[0],
        coupleStatus: couple?.status,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/settings/profile ──────────────────────────────────────────────────
export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { name } = parsed.data;
    const userId = req.user!.userId;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { ...(name && { name }) },
      select: { id: true, name: true, email: true },
    });

    res.json({ success: true, user: updated });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/settings/unlink ──────────────────────────────────────────────────
// Only creator (User A) can unlink partner
export const unlinkPartner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.isCreator) {
      res.status(403).json({ error: 'Only the couple creator can unlink a partner' });
      return;
    }

    const coupleId = req.coupleId!;

    await prisma.couple.update({
      where: { id: coupleId },
      data: { userBId: null, status: 'waiting' },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/settings/fcm-token ────────────────────────────────────────────────
export const updateFcmToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'FCM token is required' });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { fcmToken: token },
    });

    logger.info({ userId }, '[Settings] FCM token registered');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
