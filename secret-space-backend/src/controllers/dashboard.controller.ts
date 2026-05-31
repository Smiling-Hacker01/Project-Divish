import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import redis from '../config/redis';
import logger from '../config/logger';
import { uploadBase64, deleteFile } from '../services/storage.service';
import { generateDailyThought } from '../services/dailyThoughtGenerator';
import { generateLoveReason } from '../services/loveReasonGenerator';
import { updateCouplePhotoSchema } from '../utils/validators';

// Cooldown between manual refreshes per user. 60s is short enough that a user
// who hit refresh accidentally can retry within a normal app session, but long
// enough to prevent burning Gemini quota / DB writes on a held button.
const REFRESH_COOLDOWN_SECONDS = 60;

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

// ── POST /api/dashboard/refresh-reason ─────────────────────────────────────────
// Manual "give me a new Today's Reason now" trigger fired from the home screen.
// Mirrors the LoveBot cron's selection logic so what a refresh produces is
// indistinguishable from what the scheduled delivery would have produced.
//
// Flow:
//   1. Cooldown check via Redis (per-user, 60s) — refuses with 429 if hit.
//   2. Pick the oldest unused reason addressed to this user; otherwise call
//      Gemini and insert a fresh row.
//   3. Mark it used + delivered now; return its text.
//
// The mobile client surfaces 429 with a warm in-voice copy ("Give me a moment,
// I'm thinking of something special for you 💕") rather than a technical
// rate-limit message — see HomeScreen.
export const refreshReason = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;

    // 1. Per-user cooldown. Key is short-lived so it self-heals after the
    //    window passes without us needing to clean up.
    const cooldownKey = `dashboard:refresh:${userId}`;
    const existing = await redis.get(cooldownKey).catch(() => null);
    if (existing) {
      const ttl = await redis.ttl(cooldownKey).catch(() => REFRESH_COOLDOWN_SECONDS);
      res.status(429).json({
        error: 'cooldown',
        retryAfterSeconds: ttl > 0 ? ttl : REFRESH_COOLDOWN_SECONDS,
      });
      return;
    }

    // Set the cooldown BEFORE doing any work — if Gemini hangs or anything
    // throws past this point we still consume the cooldown window. That's
    // intentional: a failed refresh that's retryable in 60s is better than
    // one that lets the user spam-tap during the failure mode.
    await redis.set(cooldownKey, '1', 'EX', REFRESH_COOLDOWN_SECONDS).catch((err: any) => {
      logger.warn({ err: err?.message, cooldownKey }, '[DashboardRefresh] Redis set failed (non-fatal)');
    });

    // 2. Reuse queued row first — matches the cron's "user-authored reasons
    //    win" preference. forUserId === me because we're pulling the reason
    //    addressed to ME (the requester) from the queue.
    let reason = await prisma.loveReason.findFirst({
      where: { coupleId, forUserId: userId, used: false },
      orderBy: { createdAt: 'asc' },
    });

    if (!reason) {
      // No queued row → generate fresh. We need both partner names for the
      // Gemini prompt (sender = my partner, recipient = me, mirroring the
      // cron's framing where the bot writes "from partner to me").
      const couple = await prisma.couple.findUnique({
        where: { id: coupleId },
        select: {
          userAId: true,
          userBId: true,
          userA: { select: { name: true } },
          userB: { select: { name: true } },
        },
      });

      if (!couple || !couple.userBId) {
        res.status(404).json({ error: 'partner_not_paired' });
        return;
      }

      const isCreator = couple.userAId === userId;
      const senderName = (isCreator ? couple.userB?.name : couple.userA?.name) ?? 'your partner';
      const recipientName = (isCreator ? couple.userA?.name : couple.userB?.name) ?? 'you';
      const senderId = isCreator ? couple.userBId : couple.userAId;

      // Dedup context: 10 most recently delivered reasons for this user.
      const recent = await prisma.loveReason.findMany({
        where: { coupleId, forUserId: userId, used: true },
        orderBy: { deliveredAt: 'desc' },
        take: 10,
        select: { reason: true },
      });

      const generated = await generateLoveReason({
        senderName,
        recipientName,
        recentReasons: recent.map((r) => r.reason),
      });

      reason = await prisma.loveReason.create({
        data: {
          coupleId,
          authorId: senderId,
          forUserId: userId,
          reason: generated,
          used: false,
        },
      });
    }

    // 3. Mark used + delivered. From the partner's "Up Next" perspective this
    //    consumes one queued row, which matches the semantics of a real
    //    delivery — a refresh shouldn't create a phantom delivery that
    //    bypasses the queue.
    const delivered = await prisma.loveReason.update({
      where: { id: reason.id },
      data: { used: true, deliveredAt: new Date() },
      select: { reason: true },
    });

    logger.info({ userId, coupleId, reasonId: reason.id }, '[DashboardRefresh] Reason refreshed');

    res.json({ reason: delivered.reason });
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
