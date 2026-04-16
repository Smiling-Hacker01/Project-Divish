import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      coupleId?: string;
      partnerId?: string;
      isCreator?: boolean;
    }
  }
}

/**
 * Middleware: requires the authenticated user to belong to a couple.
 * Attaches coupleId, partnerId, and isCreator to the request.
 * Must be used AFTER verifyJWT.
 */
export const requireCouple = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const couple = await prisma.couple.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { id: true, userAId: true, userBId: true },
    });

    if (!couple) {
      res.status(403).json({ error: 'You are not part of a couple' });
      return;
    }

    req.coupleId = couple.id;
    req.isCreator = couple.userAId === userId;
    req.partnerId = couple.userAId === userId ? couple.userBId ?? undefined : couple.userAId;

    next();
  } catch (err) {
    next(err);
  }
};
