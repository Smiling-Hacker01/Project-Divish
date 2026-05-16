import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import logger from '../config/logger';
import { updateProfileSchema } from '../utils/validators';
import { uploadBuffer, deleteFile } from '../services/storage.service';
import { io } from '../websockets/chat.gateway';

// ── GET /api/settings/profile ──────────────────────────────────────────────────
export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get couple info — include both user records so we can return the partner's name + avatar.
    const couple = await prisma.couple.findFirst({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: {
        coupleCode: true,
        userAId: true,
        userBId: true,
        anniversaryDate: true,
        status: true,
        userA: { select: { id: true, name: true, avatarUrl: true } },
        userB: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    const isCreator = couple?.userAId === userId;
    const partner = isCreator ? couple?.userB : couple?.userA;
    const hasFace = !!(await prisma.faceDescriptor.findUnique({ where: { userId } }));

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
        coupleCode: couple?.coupleCode,
        isCreator,
        partnerId: partner?.id ?? null,
        partnerName: partner?.name ?? null,
        partnerAvatar: partner?.avatarUrl ?? null,
        faceMFAEnabled: hasFace,
        anniversaryDate: couple?.anniversaryDate?.toISOString().split('T')[0],
        coupleStatus: couple?.status,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/settings/profile ──────────────────────────────────────────────────
export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { name } = parsed.data;
    const userId = req.user!.userId;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { ...(name && { name }) },
      select: { id: true, name: true, email: true },
    });

    res.json({ success: true, user: updated });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/settings/unlink ──────────────────────────────────────────────────
// Only creator (User A) can unlink partner
export const unlinkPartner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.isCreator) {
      res.status(403).json({ error: 'Only the couple creator can unlink a partner' });
      return;
    }

    const coupleId = req.coupleId!;

    await prisma.couple.update({
      where: { id: coupleId },
      data: { userBId: null, status: 'waiting' },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// Best-effort Cloudinary publicId extractor — handles
// https://res.cloudinary.com/<cloud>/image/upload/v<n>/<folder>/<file>.<ext>
const publicIdFromCloudinaryUrl = (url: string): string | null => {
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
  return m ? m[1] : null;
};

// Broadcast a profile_updated event to the user's couple room (if any). Used by both
// avatar and (future) name updates so partners' UIs refresh without polling.
const broadcastProfileUpdate = async (
  userId: string,
  patch: { avatarUrl?: string | null; name?: string }
): Promise<void> => {
  try {
    if (!io) return;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { coupleAsA: { select: { id: true } }, coupleAsB: { select: { id: true } } },
    });
    const coupleId = user?.coupleAsA?.id ?? user?.coupleAsB?.id;
    if (!coupleId) return;
    io.to(coupleId).emit('profile_updated', { userId, ...patch });
  } catch (err: any) {
    logger.warn({ err: err.message, userId }, '[Settings] Failed to broadcast profile_updated');
  }
};

// ── PUT /api/settings/avatar ───────────────────────────────────────────────────
// Multer middleware populates req.file. The endpoint writes to req.user.userId only,
// so it is structurally impossible for one user to overwrite another's avatar.
export const updateAvatar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    if (!req.file) {
      res.status(400).json({ error: 'Missing file in form-data field "file"' });
      return;
    }

    // Delete the previous Cloudinary asset before replacing so we don't accumulate
    // orphans. Non-fatal: a failed delete just leaves an orphan, never blocks the upload.
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (existing?.avatarUrl) {
      const oldPublicId = publicIdFromCloudinaryUrl(existing.avatarUrl);
      if (oldPublicId) {
        deleteFile(oldPublicId).catch((err) =>
          logger.warn({ err: err?.message, userId }, '[Settings] Old avatar delete failed (non-fatal)')
        );
      }
    }

    // Per-user folder makes URL provenance auditable. `uploadBuffer` already prepends
    // `secret-space/` so we pass the sub-path.
    const uploaded = await uploadBuffer(req.file.buffer, `avatars/${userId}`);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: uploaded.url },
      select: { avatarUrl: true },
    });

    await broadcastProfileUpdate(userId, { avatarUrl: updated.avatarUrl });

    res.json({ success: true, avatarUrl: updated.avatarUrl });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/settings/avatar ────────────────────────────────────────────────
export const deleteAvatar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (existing?.avatarUrl) {
      const publicId = publicIdFromCloudinaryUrl(existing.avatarUrl);
      if (publicId) {
        deleteFile(publicId).catch((err) =>
          logger.warn({ err: err?.message, userId }, '[Settings] Avatar delete failed (non-fatal)')
        );
      }
    }
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });

    await broadcastProfileUpdate(userId, { avatarUrl: null });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/settings/fcm-token ────────────────────────────────────────────────
// Register, refresh, or clear the caller's FCM token. An empty string or explicit null
// clears the token (e.g. when the user disables notifications in settings).
export const updateFcmToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const raw = req.body?.token;
    if (raw !== null && typeof raw !== 'string') {
      res.status(400).json({ error: 'FCM token must be a string or null' });
      return;
    }
    const token = raw === null || raw.length === 0 ? null : raw;

    await prisma.user.update({
      where: { id: userId },
      data: { fcmToken: token },
    });

    logger.info({ userId, cleared: token === null }, '[Settings] FCM token updated');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
