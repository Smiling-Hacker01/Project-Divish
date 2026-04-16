import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { uploadBase64, deleteFile } from '../services/storage.service';
import { updateCouplePhotoSchema } from '../utils/validators';

// ── GET /api/dashboard ─────────────────────────────────────────────────────────
export const getHomeData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;

    const couple = await prisma.couple.findUnique({
      where: { id: coupleId },
      select: {
        anniversaryDate: true,
        couplePhoto: true,
        createdAt: true,
        userAId: true,
        userBId: true,
        userALoveBotTime: true,
        userBLoveBotTime: true,
      },
    });

    if (!couple) {
      res.status(404).json({ error: 'Couple not found' });
      return;
    }

    // Calculate days together
    const startDate = couple.anniversaryDate || couple.createdAt;
    const daysTogether = Math.floor(
      (Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Fetch moods
    const moods = await prisma.mood.findMany({
      where: { coupleId },
      select: { userId: true, mood: true },
    });
    const myMood = moods.find((m) => m.userId === userId)?.mood || '';
    const partnerMood = moods.find((m) => m.userId !== userId)?.mood || '';

    // Fetch the most recently DELIVERED reason (the real "today's" reason)
    const lastDeliveredReason = await prisma.loveReason.findFirst({
      where: { coupleId, forUserId: userId, used: true },
      orderBy: { deliveredAt: 'desc' },
      select: { reason: true },
    });

    // Fetch the next QUEUED reason to preload it securely onto the device
    const nextQueuedReason = await prisma.loveReason.findFirst({
      where: { coupleId, forUserId: userId, used: false },
      orderBy: { createdAt: 'asc' },
      select: { reason: true },
    });

    // Fetch the partner's LoveBot send time (as that implies when YOU will receive it)
    const isCreator = couple.userAId === userId;
    const nextReasonDeliveryTime = isCreator ? couple.userALoveBotTime : couple.userALoveBotTime;
    // Wait, the sender's time determines when the recipient gets it. 
    // If the recipient is user A, the sender is user B. So we should use userB's configured time.
    // However, if RBAC gives user A full control, user A sets the time for BOTH in older models.
    // In our RBAC, User A controls userALoveBotTime, User B controls userBLoveBotTime.
    const senderTime = !isCreator ? couple.userALoveBotTime : couple.userBLoveBotTime;

    // Daily thought — a static inspirational quote
    const dailyThoughts = [
      "Because the hardest seasons are the ones you'll be most proud of surviving together.",
      "Because one bad day doesn't erase a hundred beautiful ones.",
      "Because they chose you too.",
      "Every relationship has hard days. Staying anyway is the whole point.",
      "You chose each other once. Choose each other again today.",
    ];
    const dailyThought = dailyThoughts[Math.floor(Date.now() / 86400000) % dailyThoughts.length];

    const partnerStatus = couple.userBId ? 'active' : 'pending';

    res.json({
      daysTogether,
      myMood,
      partnerMood,
      couplePhoto: couple.couplePhoto,
      todaysReason: lastDeliveredReason?.reason || null,
      nextReasonText: nextQueuedReason?.reason || null,
      nextReasonDeliveryTime: senderTime,
      dailyThought,
      partnerStatus,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/dashboard/photo ──────────────────────────────────────────────────
export const updateCouplePhoto = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = updateCouplePhotoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { image } = parsed.data;
    const coupleId = req.coupleId!;

    const uploaded = await uploadBase64(image, 'couple-photos');

    await prisma.couple.update({
      where: { id: coupleId },
      data: { couplePhoto: uploaded.url },
    });

    res.json({ success: true, photoUrl: uploaded.url });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/dashboard/photo ────────────────────────────────────────────────
export const removeCouplePhoto = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupleId = req.coupleId!;

    const couple = await prisma.couple.findUnique({
      where: { id: coupleId },
      select: { couplePhoto: true },
    });

    if (couple?.couplePhoto) {
      try {
        const urlParts = couple.couplePhoto.split('/');
        const publicId = urlParts.slice(-2).join('/').split('.')[0];
        await deleteFile(publicId);
      } catch {
        // Non-critical
      }
    }

    await prisma.couple.update({
      where: { id: coupleId },
      data: { couplePhoto: null },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
