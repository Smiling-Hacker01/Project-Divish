import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { uploadBase64, deleteFile } from '../services/storage.service';
import { generateDailyThought } from '../services/dailyThoughtGenerator';
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
        // Both partners' names are pulled in so the daily-thought generator
        // can include them as tonal context in its Gemini prompt.
        userA: { select: { name: true } },
        userB: { select: { name: true } },
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

    // The partner's LoveBot send time tells us when YOU will receive it. In the
    // current model, each user controls their OWN lovebot time and it specifies
    // when their partner gets pinged — so to know when *I* get one, look at my
    // partner's configured time.
    const isCreator = couple.userAId === userId;
    const senderTime = isCreator ? couple.userBLoveBotTime : couple.userALoveBotTime;

    // Daily thought — Gemini-generated perseverance reflection that complements
    // (rather than duplicates) the LoveBot's "Today's Reason." The generator
    // handles its own Redis caching with an IST date key, so this call hits
    // Gemini at most once per couple per day and serves cache on every other
    // Home open. Falls back to an inline bank when Gemini is unavailable; the
    // bank result is intentionally NOT cached so a brief Gemini hiccup
    // doesn't lock the couple into a fallback for the rest of the day.
    const dailyThought = await generateDailyThought({
      coupleId,
      user1Name: couple.userA?.name ?? 'You',
      user2Name: couple.userB?.name ?? 'your partner',
      anniversaryDate: couple.anniversaryDate?.toISOString().split('T')[0],
    });

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
