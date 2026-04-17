import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { createCouponSchema, updateCouponStatusSchema, couponReviewSchema } from '../utils/validators';

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

    if (status === 'pending' && coupon.recipientId !== userId) {
      res.status(403).json({ error: 'Only the recipient can redeem this coupon' });
      return;
    }

    if (status === 'used' && coupon.creatorId !== userId) {
      res.status(403).json({ error: 'Only the creator can approve this coupon redemption' });
      return;
    }

    const updateData: any = { status };
    if (status === 'pending' && (!coupon.redeemedAt)) {
        updateData.redeemedAt = new Date();
    }

    await prisma.coupon.update({
      where: { id },
      data: updateData,
    });

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

    await prisma.coupon.update({
      where: { id },
      data: {
        status: 'fulfilled',
        fulfilledAt: new Date(),
      },
    });

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

    await prisma.coupon.update({
      where: { id },
      data: {
        reviewRating: rating,
        reviewText: text || null,
        reviewedAt: new Date(),
      },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// Helper
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
