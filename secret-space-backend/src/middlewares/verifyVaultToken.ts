import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';

/**
 * Middleware: verifies that the request includes a valid vault session token.
 * The token must exist in Redis and belong to the requesting user.
 * Must be used AFTER verifyJWT.
 */
export const verifyVaultToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const vaultToken = req.headers['x-vault-token'] as string;
    if (!vaultToken) {
      res.status(401).json({ error: 'Missing vault token. Please unlock the vault first.' });
      return;
    }

    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const storedUserId = await redis.get(`vault:${vaultToken}`);
    if (!storedUserId || storedUserId !== userId) {
      res.status(401).json({ error: 'Invalid or expired vault token. Please unlock again.' });
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
};
