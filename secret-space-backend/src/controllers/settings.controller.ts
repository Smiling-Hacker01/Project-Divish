import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/prisma';
import redis from '../config/redis';
import logger from '../config/logger';
import { updateProfileSchema } from '../utils/validators';
import { uploadBuffer, deleteFile } from '../services/storage.service';
import { generateOtp, OTP_EXPIRY_MINUTES, sendOtpEmail } from '../utils/otp';
import { extractDescriptor } from '../services/face.service';
import { io } from '../websockets/chat.gateway';

const BCRYPT_SALT_ROUNDS = 12;
// Redis key holding a JSON blob: { otp, newPasswordHash } for the in-flight change.
// The OTP gates the *confirmation* step; the hash is pre-computed at init so the
// confirm step doesn't have to re-bcrypt or revalidate the new password rules.
const PWCHANGE_KEY = (userId: string) => `pwchange:${userId}`;

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

// ── POST /api/settings/face-descriptor ─────────────────────────────────────────
// Re-enroll an already-authenticated user's face descriptor. Unlike the signup-time
// `POST /api/auth/enroll-face` which gates on email+password, this trusts the JWT —
// the user is already signed in and we just want to update their stored embedding.
// Upserts so calling this on a user with no prior descriptor also works.
export const enrollFaceDescriptor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const faceImage = req.body?.faceImage;
    if (typeof faceImage !== 'string' || faceImage.length < 100) {
      res.status(400).json({ error: 'faceImage (base64) is required' });
      return;
    }

    const descriptor = await extractDescriptor(faceImage);
    if (!descriptor) {
      res.status(422).json({ error: 'No face detected in the image. Please try again.' });
      return;
    }

    await prisma.faceDescriptor.upsert({
      where: { userId },
      create: { userId, descriptor },
      update: { descriptor },
    });
    logger.info({ userId }, '[Settings] Face descriptor re-enrolled');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/settings/face-descriptor ───────────────────────────────────────
// Removes the user's enrolled face descriptor, disabling face-MFA at login. The
// user can re-enroll later through the same flow as initial signup. Removing it
// is destructive but reversible — the descriptor file isn't kept anywhere else.
export const deleteFaceDescriptor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    // deleteMany so calling on an already-disabled account isn't a 404 — idempotent.
    const result = await prisma.faceDescriptor.deleteMany({ where: { userId } });
    logger.info({ userId, removed: result.count }, '[Settings] Face descriptor removed');
    res.json({ success: true, removed: result.count });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/settings/password/init ───────────────────────────────────────────
// First step of the change-password flow:
//   1. Verify the user's current password (so a stolen JWT alone can't pivot).
//   2. Validate the proposed new password meets policy.
//   3. Pre-bcrypt the new password and stash it in Redis alongside a 6-digit OTP.
//   4. Email the OTP to the user's address.
//
// The actual update happens in /password/confirm once the OTP is verified.
export const initPasswordChange = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body ?? {};

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      res.status(400).json({ error: 'Both currentPassword and newPassword are required' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }
    if (newPassword === currentPassword) {
      res.status(400).json({ error: 'New password must be different from the current one' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      // Constant-time-ish: bcrypt.compare already takes ~100ms, so the timing
      // between "wrong password" and "right password but bad OTP" is similar.
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    const otp = generateOtp();
    await redis.set(
      PWCHANGE_KEY(userId),
      JSON.stringify({ otp, newPasswordHash }),
      'EX',
      OTP_EXPIRY_MINUTES * 60
    );

    // Send the OTP via the same email transport the login flow uses. If SMTP isn't
    // configured the util logs a warning and the user just won't receive a code —
    // they can retry init after fixing the SMTP env vars.
    await sendOtpEmail(user.email, otp).catch((err) =>
      logger.error({ err: err?.message, userId }, '[Settings] OTP email failed')
    );

    logger.info({ userId }, '[Settings] Password change initiated');
    res.json({ success: true, email: user.email.replace(/(.{2}).+(@.+)/, '$1***$2') });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/settings/password/confirm ────────────────────────────────────────
// Second step: verify the OTP and commit the new password hash that was stashed
// at init. We do NOT take the password in this body — that would require the
// client to keep it around, and we already have a bcrypt'd version in Redis.
export const confirmPasswordChange = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { otp } = req.body ?? {};
    if (typeof otp !== 'string' || otp.length === 0) {
      res.status(400).json({ error: 'OTP is required' });
      return;
    }

    const raw = await redis.get(PWCHANGE_KEY(userId));
    if (!raw) {
      res.status(400).json({ error: 'No password change in progress, or the code expired' });
      return;
    }

    let parsed: { otp: string; newPasswordHash: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      await redis.del(PWCHANGE_KEY(userId));
      res.status(500).json({ error: 'Password change state corrupt, please retry' });
      return;
    }

    if (parsed.otp !== otp) {
      // Don't clear the Redis state on a wrong OTP — let the user retry until the
      // TTL expires. (Brute-forcing 6 digits in 10 minutes against a rate-limited
      // endpoint is impractical.)
      res.status(401).json({ error: 'That code did not match. Please try again.' });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: parsed.newPasswordHash },
    });
    await redis.del(PWCHANGE_KEY(userId));

    logger.info({ userId }, '[Settings] Password change confirmed');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
