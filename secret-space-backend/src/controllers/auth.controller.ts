import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import redis from '../config/redis';
import logger from '../config/logger';
import {
  signAccessToken,
  signRefreshToken,
  signTempToken,
  verifyRefreshToken,
} from '../utils/jwt';
import { generateCoupleCode } from '../utils/coupleCode';
import { getPopulatedUser } from '../utils/userPopulator';
import { extractDescriptor, verifyFace } from '../services/face.service';
import { generateOtp, OTP_EXPIRY_MINUTES, sendOtpEmail } from '../utils/otp';
import { sendEmail } from '../emails';
import { inviteEmail } from '../emails/templates';
import {
  signupSchema,
  joinSchema,
  loginSchema,
  enrollFaceSchema,
  faceVerifySchema,
  otpVerifySchema,
  refreshSchema,
  sendInviteSchema,
} from '../utils/validators';

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_COUPLE_CODE_RETRIES = 5;

// ── Helper: store refresh token in Redis ───────────────────────────────────────
const storeRefreshToken = async (userId: string, token: string): Promise<void> => {
  await redis.set(`refresh:${userId}`, token, 'EX', REFRESH_TOKEN_EXPIRY_SECONDS);
};

// ── Helper: generate couple code with collision retry ──────────────────────────
const generateUniqueCoupleCode = async (): Promise<string> => {
  for (let i = 0; i < MAX_COUPLE_CODE_RETRIES; i++) {
    const code = generateCoupleCode();
    const existing = await prisma.couple.findUnique({ where: { coupleCode: code } });
    if (!existing) return code;
  }
  throw new Error('Failed to generate a unique couple code after retries');
};

// `getPopulatedUser` lives in `utils/userPopulator.ts` so settings.controller's
// /profile endpoint can serve the same shape (otherwise a refresh would silently
// drop fields like isCreator that the mobile UI depends on).

// ── POST /api/auth/signup ──────────────────────────────────────────────────────
export const signup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { name, email, password, anniversaryDate } = parsed.data;

    logger.info({ email, passwordLength: password.length }, '[Auth][DEBUG] Signup - hashing password');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Immediately verify the hash is correct (debug safety check)
    const verifyHash = await bcrypt.compare(password, passwordHash);
    logger.info({ verifyHash, hashPrefix: passwordHash.substring(0, 7) }, '[Auth][DEBUG] Signup - hash verification');

    const coupleCode = await generateUniqueCoupleCode();

    // Use transaction for atomicity — catches P2002 if email already exists
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newUser = await tx.user.create({
        data: { name, email, passwordHash },
      });
      await tx.couple.create({
        data: {
          userAId: newUser.id,
          coupleCode,
          anniversaryDate: anniversaryDate ? new Date(anniversaryDate) : undefined,
        },
      });
      return newUser;
    });

    // Signup returns a temp token — user must enroll face or verify OTP first
    const tempToken = signTempToken({ userId: user.id, email: user.email });

    logger.info({ userId: user.id }, '[Auth] New user signed up');

    const populatedUser = await getPopulatedUser(user.id);

    res.status(201).json({
      message: 'Account created. Please enroll your face or verify via OTP to get full access.',
      coupleCode,
      tempToken,
      user: populatedUser,
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    next(err);
  }
};

// ── POST /api/auth/join ────────────────────────────────────────────────────────
// Second partner joins an existing couple using the couple code
export const join = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { name, email, password, coupleCode } = parsed.data;

    const couple = await prisma.couple.findUnique({ where: { coupleCode } });
    if (!couple) {
      res.status(404).json({ error: 'Invalid couple code' });
      return;
    }
    if (couple.userBId) {
      res.status(409).json({ error: 'This couple code is already fully linked' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Use transaction for atomicity
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newUser = await tx.user.create({
        data: { name, email, passwordHash },
      });
      await tx.couple.update({
        where: { id: couple.id },
        data: { userBId: newUser.id, status: 'active' },
      });
      return newUser;
    });

    // Join also returns temp token — must complete MFA
    const tempToken = signTempToken({ userId: user.id, email: user.email });

    logger.info({ userId: user.id, coupleCode }, '[Auth] User joined couple');

    const populatedUser = await getPopulatedUser(user.id);

    res.status(201).json({
      message: 'Joined couple. Please enroll your face or verify via OTP to get full access.',
      tempToken,
      user: populatedUser,
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    next(err);
  }
};

// ── POST /api/auth/send-invite ────────────────────────────────────────────────
// Authenticated initiator (User A) sends a branded invitation email to their
// partner containing the couple code, app install instructions, and a warm
// human-voiced "X invited you to The Secret Space" framing. The endpoint is a
// pure convenience layer over the existing /join flow — the recipient still
// completes the existing JoinCodeScreen path on their device using the code
// from the email; we don't issue an alternate token or create a pending
// User B row server-side, so the existing /join atomicity and idempotency
// guarantees are completely untouched.
//
// Eligibility:
//   - Caller must be authenticated (full JWT, not temp)
//   - Caller must be the creator (User A) of their couple
//   - Couple must still be in 'waiting' state (User B has not yet joined)
//
// Rate limits (Redis-backed, per-couple and per-recipient-email):
//   - Per-couple: 5 invites per 24h. Prevents accidental spam loops.
//   - Per-email:  1 invite per 24h. Prevents repeated invite-bombing of the
//                 same address (matters because invitees could be third
//                 parties if the inviter typo'd the email).
//
// Security posture: the email contains the same couple code the inviter
// already has on their CoupleCodeScreen's native share sheet — same one-shot
// code, consumed atomically by the first successful /join call, so a
// wrong-email send does not give an attacker a re-usable credential. The
// legitimate partner can be re-invited with the correct address.
export const sendInvite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = sendInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { email: inviteeEmail } = parsed.data;
    const userId = req.user!.userId;

    // 1. Resolve the caller's couple + verify creator role + waiting state.
    const couple = await prisma.couple.findFirst({
      where: { userAId: userId },
      select: { id: true, coupleCode: true, status: true, userBId: true },
    });

    if (!couple) {
      // Caller is not a couple creator — either they're a User B (joined an
      // existing couple) or they have no couple yet. Either way the invite
      // endpoint isn't applicable to them.
      res.status(403).json({ error: 'Only the space creator can send invitations.' });
      return;
    }

    if (couple.userBId || couple.status === 'active') {
      res.status(409).json({ error: 'Your partner has already joined this space.' });
      return;
    }

    // 2. Prevent the inviter from inviting their OWN email — small but
    // common UX footgun that would just bounce around their own inbox.
    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!inviter) {
      // Shouldn't happen given verifyJWT, but defensive.
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }
    if (inviter.email.toLowerCase() === inviteeEmail) {
      res.status(400).json({ error: "That's your own email. Try your partner's address." });
      return;
    }

    // 3. Rate limits — per-couple AND per-recipient, both 24h windows.
    const coupleKey = `invite:rate:couple:${couple.id}`;
    const emailKey = `invite:rate:email:${inviteeEmail}`;

    const [coupleCount, emailExists] = await Promise.all([
      redis.get(coupleKey).then((v) => (v ? Number(v) : 0)).catch(() => 0),
      redis.get(emailKey).catch(() => null),
    ]);

    if (coupleCount >= 5) {
      res.status(429).json({
        error: "You've sent a lot of invites today. Try again tomorrow.",
      });
      return;
    }
    if (emailExists) {
      res.status(429).json({
        error: 'An invitation was already sent to that address today.',
      });
      return;
    }

    // 4. Send the email through the shared framework. APP_DOWNLOAD_URL is
    // optional — when unset (pre-launch) the template uses softer copy that
    // doesn't promise a clickable link. When set (post-Play-Store-launch)
    // the template surfaces a real "Download Secret Space" CTA.
    try {
      const template = inviteEmail({
        inviterName: inviter.name,
        coupleCode: couple.coupleCode,
        appDownloadUrl: process.env.APP_DOWNLOAD_URL || undefined,
      });
      await sendEmail({
        to: inviteeEmail,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
    } catch (err: any) {
      logger.error(
        { err: err?.message, coupleId: couple.id, inviteeEmail },
        '[Auth] Invite email send failed'
      );
      // Don't burn the rate-limit budget if we never actually delivered the
      // email — leave both Redis keys unset so the user can retry.
      res.status(502).json({ error: "Couldn't send the invitation. Try again in a moment." });
      return;
    }

    // 5. Record the send in Redis for rate limiting. Done AFTER successful
    // delivery so a failed send is retry-able. The per-couple counter
    // increments and the per-email key gets a 24h TTL.
    const [, , ttl] = await Promise.all([
      redis.incr(coupleKey),
      redis.set(emailKey, '1', 'EX', 86_400),
      redis.ttl(coupleKey).catch(() => -1),
    ]);
    // First increment on a fresh key has no TTL — set one. ttl === -1 means
    // "key exists with no expiry" so we need to anchor a 24h window.
    if (ttl === -1) {
      await redis.expire(coupleKey, 86_400).catch(() => undefined);
    }

    logger.info(
      { coupleId: couple.id, inviterId: userId, inviteeEmail },
      '[Auth] Partner invitation sent'
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// MFA Step 1: verify email + password → issue a temp token
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { email, password } = parsed.data;

    logger.info({ email, passwordLength: password?.length }, '[Auth][DEBUG] Login attempt');

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      logger.warn({ email }, '[Auth][DEBUG] User not found for email');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    logger.info({ userId: user.id, hashPrefix: user.passwordHash.substring(0, 7) }, '[Auth][DEBUG] User found, comparing password');

    const valid = await bcrypt.compare(password, user.passwordHash);
    logger.info({ valid }, '[Auth][DEBUG] bcrypt.compare result');
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check if user has face enrolled — determines next MFA step
    const hasFace = await prisma.faceDescriptor.findUnique({ where: { userId: user.id } });

    const tempToken = signTempToken({ userId: user.id, email: user.email });

    res.json({
      message: 'Password verified. Complete MFA to get access token.',
      tempToken,
      mfaMethod: hasFace ? 'face' : 'otp',
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/enroll-face ─────────────────────────────────────────────────
// Enrolls a face descriptor for a user (uses email+password in body)
export const enrollFace = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = enrollFaceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { email, password, faceImage } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const descriptor = await extractDescriptor(faceImage);
    if (!descriptor) {
      res.status(422).json({ error: 'No face detected in the image. Please try again.' });
      return;
    }

    await prisma.faceDescriptor.upsert({
      where: { userId: user.id },
      create: { userId: user.id, descriptor },
      update: { descriptor },
    });

    logger.info({ userId: user.id }, '[Auth] Face enrolled');
    res.json({ message: 'Face enrolled successfully' });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/face-verify ─────────────────────────────────────────────────
// MFA Step 2 (primary): verify face → issue full access + refresh tokens
export const faceVerify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId, email } = req.tempUser!;

    const parsed = faceVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { faceImage } = parsed.data;

    const stored = await prisma.faceDescriptor.findUnique({ where: { userId } });
    if (!stored) {
      res.status(404).json({ error: 'No face enrolled. Please enroll first.' });
      return;
    }

    const result = await verifyFace(faceImage, stored.descriptor);
    if (!result.matched) {
      res.status(401).json({ error: 'Face does not match', distance: result.distance });
      return;
    }

    const accessToken = signAccessToken({ userId, email });
    const refreshToken = signRefreshToken({ userId, email });
    await storeRefreshToken(userId, refreshToken);

    logger.info({ userId }, '[Auth] Face verified — full tokens issued');
    const populatedUser = await getPopulatedUser(userId);
    res.json({ message: 'Face verified', accessToken, refreshToken, user: populatedUser });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/otp-request ─────────────────────────────────────────────────
// MFA Step 2 fallback: send OTP to user's email
export const otpRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId, email } = req.tempUser!;

    const otp = generateOtp();
    await redis.set(`otp:${userId}`, otp, 'EX', OTP_EXPIRY_MINUTES * 60);

    await sendOtpEmail(email, otp);

    res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/otp-verify ──────────────────────────────────────────────────
// MFA Step 2 fallback: verify OTP → issue full tokens
export const otpVerify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId, email } = req.tempUser!;

    const parsed = otpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { otp } = parsed.data;

    const stored = await redis.get(`otp:${userId}`);
    if (!stored) {
      res.status(410).json({ error: 'OTP expired. Request a new one.' });
      return;
    }
    if (stored !== otp) {
      res.status(401).json({ error: 'Invalid OTP' });
      return;
    }

    await redis.del(`otp:${userId}`);

    const accessToken = signAccessToken({ userId, email });
    const refreshToken = signRefreshToken({ userId, email });
    await storeRefreshToken(userId, refreshToken);

    logger.info({ userId }, '[Auth] OTP verified — full tokens issued');
    const populatedUser = await getPopulatedUser(userId);
    res.json({ message: 'OTP verified', accessToken, refreshToken, user: populatedUser });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/refresh ─────────────────────────────────────────────────────
// Rotates the refresh token — old one is invalidated
export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { refreshToken } = parsed.data;

    const payload = verifyRefreshToken(refreshToken);

    // Check that this refresh token matches what's stored (prevents replay)
    const storedToken = await redis.get(`refresh:${payload.userId}`);
    if (!storedToken || storedToken !== refreshToken) {
      // Possible token reuse attack — revoke everything
      await redis.del(`refresh:${payload.userId}`);
      logger.warn({ userId: payload.userId }, '[Auth] Refresh token reuse detected — all sessions revoked');
      res.status(401).json({ error: 'Token reuse detected. Please login again.' });
      return;
    }

    // Issue new tokens and rotate
    const newAccessToken = signAccessToken({ userId: payload.userId, email: payload.email });
    const newRefreshToken = signRefreshToken({ userId: payload.userId, email: payload.email });
    await storeRefreshToken(payload.userId, newRefreshToken);

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
};

// ── POST /api/auth/logout ──────────────────────────────────────────────────────
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.user!;

    // Revoke refresh token
    await redis.del(`refresh:${userId}`);

    // Clear FCM token
    await prisma.user.update({
      where: { id: userId },
      data: { fcmToken: null },
    });

    logger.info({ userId }, '[Auth] User logged out');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};