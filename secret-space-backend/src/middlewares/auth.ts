import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, verifyTempToken, JwtPayload } from '../utils/jwt';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      tempUser?: { userId: string; email: string };
    }
  }
}

export const verifyJWT = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Used only on /face-verify and /otp-verify routes — after password check passes
export const verifyTempJWT = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing temp token' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyTempToken(token);
    req.tempUser = { userId: decoded.userId, email: decoded.email };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired temp token. Please login again.' });
  }
};