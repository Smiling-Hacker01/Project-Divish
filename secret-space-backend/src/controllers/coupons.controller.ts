import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { createCouponSchema, updateCouponStatusSchema } from '../utils/validators';

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
      status: capitalize(c.status) as 'Active' | 'Pending' | 'Used' | 'Expired',
      expiry: c.expiresAt?.toISOString(),
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
      res.status(400).json({ error: 'Your couple is not fully linked yet' });
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

    // Only the recipient can redeem/use a coupon
    if ((status === 'used' || status === 'pending') && coupon.recipientId !== userId) {
      res.status(403).json({ error: 'Only the recipient can redeem this coupon' });
      return;
    }

    await prisma.coupon.update({
      where: { id },
      data: { status },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// Helper
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
