import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../config/prisma';
import redis from '../config/redis';
import logger from '../config/logger';
import { uploadBase64, deleteFile } from '../services/storage.service';
import { createVaultItemSchema } from '../utils/validators';

const VAULT_TOKEN_TTL = 5 * 60; // 5 minutes

// ── POST /api/vault/unlock ─────────────────────────────────────────────────────
// Issues a short-lived vault session token after frontend biometric verification
export const unlockVault = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { password } = req.body;

    // If password fallback is used, verify it. Otherwise, assume NativeBiometric success.
    if (password) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: 'Incorrect password' });
        return;
      }
    }

    const token = crypto.randomUUID();

    await redis.set(`vault:${token}`, userId, 'EX', VAULT_TOKEN_TTL);

    logger.info({ userId }, '[Vault] Session token issued');
    res.json({ success: true, token });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/vault ─────────────────────────────────────────────────────────────
export const getItems = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const items = await prisma.vaultFile.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      items.map((item) => ({
        id: item.id,
        type: item.fileType === 'image' ? 'photo' : 'video',
        url: item.fileUrl,
        timestamp: item.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    next(err);
  }
};

// ── POST /api/vault ────────────────────────────────────────────────────────────
export const createItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = createVaultItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { fileType, fileData } = parsed.data;
    const userId = req.user!.userId;

    const uploaded = await uploadBase64(fileData, 'vault');

    const item = await prisma.vaultFile.create({
      data: {
        ownerId: userId,
        fileUrl: uploaded.url,
        fileType,
        thumbnailUrl: fileType === 'image' ? uploaded.url : undefined,
      },
    });

    res.status(201).json({
      id: item.id,
      type: item.fileType === 'image' ? 'photo' : 'video',
      url: item.fileUrl,
      timestamp: item.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/vault/:id ──────────────────────────────────────────────────────
export const deleteItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const item = await prisma.vaultFile.findFirst({ where: { id, ownerId: userId } });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    // Try to extract publicId from URL and delete from Cloudinary
    try {
      const urlParts = item.fileUrl.split('/');
      const publicId = urlParts.slice(-2).join('/').split('.')[0];
      await deleteFile(publicId);
    } catch {
      // Non-critical: file might have already been deleted
    }

    await prisma.vaultFile.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
