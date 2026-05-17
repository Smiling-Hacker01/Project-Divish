import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import logger from '../config/logger';
import { createCouponSchema, updateCouponStatusSchema, couponReviewSchema } from '../utils/validators';
import { sendPush } from '../services/notification.service';
import { io } from '../websockets/chat.gateway';

// ── Realtime helper ────────────────────────────────────────────────────────────
// Emits `coupon_changed` to the couple's socket room so both partners' coupon lists
// update without a manual pull-to-refresh. Mirrors the broadcastDiaryChange pattern.
type CouponChange =
  | { action: 'created'; couponId: string }
  | { action: 'status'; couponId: string; status: string }
  | { action: 'fulfilled'; couponId: string }
  | { action: 'reviewed'; couponId: string };

const broadcastCouponChange = (coupleId: string, change: CouponChange): void => {
  try {
    io?.to(coupleId).emit('coupon_changed', change);
  } catch (err: any) {
    logger.warn({ err: err?.message, coupleId }, '[Coupon] Broadcast failed (non-fatal)');
  }
};

// ── GET /api/coupons ───────────────────────────────────────────────────────────
export const getCoupons = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;

    const coupons = await prisma.coupon.findMany({
      where: { coupleId },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true } },
        recipient: { select: { id: true, name: true } },
      },
    });

    const mapped = coupons.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description || '',
      status: capitalize(c.status) as 'Active' | 'Pending' | 'Used' | 'Fulfilled' | 'Expired',
      expiry: c.expiresAt?.toISOString(),
      redeemedAt: c.redeemedAt?.toISOString(),
      fulfilledAt: c.fulfilledAt?.toISOString(),
      reviewRating: c.reviewRating,
      reviewText: c.reviewText || '',
      reviewedAt: c.reviewedAt?.toISOString(),
      creator: c.creatorId === userId ? 'you' : 'partner',
      recipient: c.recipientId === userId ? 'you' : 'partner',
      createdAt: c.createdAt.toISOString(),
    }));

    res.json(mapped);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/coupons/:id ───────────────────────────────────────────────────────
export const getCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;
    const { id } = req.params;

    const c = await prisma.coupon.findFirst({
      where: { id, coupleId },
      include: {
        creator: { select: { id: true, name: true } },
        recipient: { select: { id: true, name: true } },
      },
    });

    if (!c) {
      res.status(404).json({ error: 'Coupon not found' });
      return;
    }

    res.json({
      id: c.id,
      title: c.title,
      description: c.description || '',
      status: capitalize(c.status),
      expiry: c.expiresAt?.toISOString(),
      redeemedAt: c.redeemedAt?.toISOString(),
      fulfilledAt: c.fulfilledAt?.toISOString(),
      reviewRating: c.reviewRating,
      reviewText: c.reviewText || '',
      reviewedAt: c.reviewedAt?.toISOString(),
      creator: c.creatorId === userId ? 'you' : 'partner',
      recipient: c.recipientId === userId ? 'you' : 'partner',
      createdAt: c.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/coupons ──────────────────────────────────────────────────────────
export const createCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = createCouponSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { title, description, expiresAt } = parsed.data;
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;
    const partnerId = req.partnerId;

    if (!partnerId) {
      res.status(400).json({ error: 'Your partner is not linked yet' });
      return;
    }

    const coupon = await prisma.coupon.create({
      data: {
        coupleId,
        creatorId: userId,
        recipientId: partnerId,
        title,
        description,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
    });

    broadcastCouponChange(coupleId, { action: 'created', couponId: coupon.id });

    // Notify the recipient about the new coupon
    await sendPush(
      partnerId,
      '🎟️ New Coupon!',
      "You've received a new coupon 💌 Tap to explore and redeem it anytime!",
      { url: '/coupons' }
    ).catch(e => console.error('[Push Error] Coupon creation:', e));

    res.status(201).json({
      id: coupon.id,
      title: coupon.title,
      description: coupon.description || '',
      status: 'Active',
      expiry: coupon.expiresAt?.toISOString(),
      creator: 'you',
      recipient: 'partner',
      createdAt: coupon.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/coupons/:id/status ──────────────────────────────────────────────
// State-machine transitions for a coupon. Each transition is gated by:
//   1) authorization (recipient redeems; creator approves)
//   2) expected current state (no skipping or repeating stages)
//   3) an atomic conditional update so two parallel requests can't both succeed
//      (the second sees affected-rows = 0 and we treat it as a no-op).
export const updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = updateCouponStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { status } = parsed.data;
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;
    const { id } = req.params;

    const coupon = await prisma.coupon.findFirst({ where: { id, coupleId } });
    if (!coupon) {
      res.status(404).json({ error: 'Coupon not found' });
      return;
    }

    // Authorization gates.
    if (status === 'pending' && coupon.recipientId !== userId) {
      res.status(403).json({ error: 'Only the recipient can redeem this coupon' });
      return;
    }
    if (status === 'used' && coupon.creatorId !== userId) {
      res.status(403).json({ error: 'Only the creator can approve this coupon redemption' });
      return;
    }

    // Idempotency: already in the target state → no-op success. Avoids re-firing
    // the push notification when a user double-taps the action button.
    if (coupon.status === status) {
      res.json({ success: true, alreadyApplied: true });
      return;
    }

    // State-machine guard: every transition has a single legal predecessor.
    //   active → pending (redeem)
    //   pending → used (approve)
    //   used → fulfilled (only via /fulfill, not this endpoint)
    const expectedPrevStatus: Record<string, string> = {
      pending: 'active',
      used: 'pending',
    };
    const expected = expectedPrevStatus[status];
    if (!expected) {
      res.status(400).json({ error: `Cannot transition to status "${status}" via this endpoint` });
      return;
    }

    const updateData: any = { status };
    if (status === 'pending') {
      updateData.redeemedAt = new Date();
    }

    // Conditional update — only writes if the row is still in the expected state.
    // A parallel request that already flipped the status sees `count: 0` here.
    const result = await prisma.coupon.updateMany({
      where: { id, coupleId, status: expected },
      data: updateData,
    });

    if (result.count === 0) {
      // Someone else moved the state forward between our read and write. Reload
      // and report what the current state actually is — clients can re-sync.
      const fresh = await prisma.coupon.findUnique({ where: { id } });
      res.status(409).json({
        error: `Coupon is no longer in the expected state.`,
        currentStatus: fresh?.status ?? null,
      });
      return;
    }

    broadcastCouponChange(coupleId, { action: 'status', couponId: id, status });

    // ── Send Push Notification based on lifecycle stage ──────────────────────
    try {
      if (status === 'pending') {
        // Recipient redeemed it -> notify the Creator
        await sendPush(
          coupon.creatorId,
          '💌 Coupon Redeemed!',
          'Your partner just redeemed a coupon 💌 Time to make it special!',
          { url: `/coupons` }
        );
      } else if (status === 'used') {
        // Creator approved it -> notify the Recipient
        await sendPush(
          coupon.recipientId,
          '✨ Redemption Approved!',
          'Your partner approved your coupon! It will be fulfilled soon.',
          { url: `/coupons` }
        );
      } else if (status === 'fulfilled') {
        // Creator fulfilled it -> notify the Recipient
        await sendPush(
          coupon.recipientId,
          '🎉 Coupon Fulfilled!',
          'Your partner has worked their magic! Hope you enjoyed the coupon.',
          { url: `/coupons` }
        );
      }
    } catch (e: any) {
      console.error('[Push Error] Coupon lifecycle:', e);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/coupons/:id/fulfill ─────────────────────────────────────────────
export const fulfillCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;
    const { id } = req.params;

    const coupon = await prisma.coupon.findFirst({ where: { id, coupleId } });
    if (!coupon) {
      res.status(404).json({ error: 'Coupon not found' });
      return;
    }

    if (coupon.creatorId !== userId) {
      res.status(403).json({ error: 'Only the issuer can mark this coupon as fulfilled' });
      return;
    }

    if (coupon.status !== 'used') {
       res.status(400).json({ error: 'Coupon must be redeemed (used) before it can be fulfilled' });
       return;
    }

    // Conditional update — only flips to fulfilled if the coupon is STILL `used`.
    // A double-tap from the creator otherwise re-fires the push notification.
    const result = await prisma.coupon.updateMany({
      where: { id, coupleId, status: 'used' },
      data: {
        status: 'fulfilled',
        fulfilledAt: new Date(),
      },
    });
    if (result.count === 0) {
      res.status(409).json({ error: 'Coupon was already fulfilled or its state changed.' });
      return;
    }

    broadcastCouponChange(coupleId, { action: 'fulfilled', couponId: id });

    // Notify the recipient that the coupon has been fulfilled + prompt for review
    await sendPush(
      coupon.recipientId,
      '✨ Coupon Fulfilled!',
      'Your coupon has been fulfilled ✨ Share your experience and help your partner make it even more special next time!',
      { url: '/coupons' }
    ).catch(e => console.error('[Push Error] Coupon fulfillment:', e));

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/coupons/pending-fulfillments ──────────────────────────────────────
export const getPendingFulfillments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;

    const coupons = await prisma.coupon.findMany({
      where: { coupleId, creatorId: userId, status: 'used' },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true } },
        recipient: { select: { id: true, name: true } },
      },
    });

    const mapped = coupons.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description || '',
      status: capitalize(c.status) as 'Active' | 'Pending' | 'Used' | 'Fulfilled' | 'Expired',
      expiry: c.expiresAt?.toISOString(),
      redeemedAt: c.redeemedAt?.toISOString(),
      fulfilledAt: c.fulfilledAt?.toISOString(),
      creator: 'you',
      recipient: 'partner',
      createdAt: c.createdAt.toISOString(),
    }));

    res.json(mapped);
  } catch (err) {
    next(err);
  }
};

// ── POST /api/coupons/:id/review ───────────────────────────────────────────────
export const addReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = couponReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { rating, text } = parsed.data;
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;
    const { id } = req.params;

    const coupon = await prisma.coupon.findFirst({ where: { id, coupleId } });
    if (!coupon) {
      res.status(404).json({ error: 'Coupon not found' });
      return;
    }

    if (coupon.recipientId !== userId) {
      res.status(403).json({ error: 'Only the recipient can review a coupon' });
      return;
    }

    if (coupon.status !== 'fulfilled') {
      res.status(400).json({ error: 'Coupon must be fulfilled before reviewing' });
      return;
    }

    if (coupon.reviewRating !== null) {
      res.status(400).json({ error: 'You have already reviewed this coupon' });
      return;
    }

    // Conditional update so two simultaneous review submissions can't both win and
    // overwrite each other's text / rating.
    const result = await prisma.coupon.updateMany({
      where: { id, coupleId, reviewRating: null, status: 'fulfilled' },
      data: {
        reviewRating: rating,
        reviewText: text || null,
        reviewedAt: new Date(),
      },
    });
    if (result.count === 0) {
      res.status(409).json({ error: 'A review was already submitted for this coupon.' });
      return;
    }

    broadcastCouponChange(coupleId, { action: 'reviewed', couponId: id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// Helper
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
