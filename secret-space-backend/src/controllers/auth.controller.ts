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
import { extractDescriptor, verifyFace } from '../services/face.service';
import { generateOtp, OTP_EXPIRY_MINUTES, sendOtpEmail } from '../utils/otp';
import {
  signupSchema,
  joinSchema,
  loginSchema,
  enrollFaceSchema,
  faceVerifySchema,
  otpVerifySchema,
  refreshSchema,
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

// ── POST /api/auth/signup ──────────────────────────────────────────────────────
export const signup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { name, email, password } = parsed.data;

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const coupleCode = await generateUniqueCoupleCode();

    // Use transaction for atomicity — catches P2002 if email already exists
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newUser = await tx.user.create({
        data: { name, email, passwordHash },
      });
      await tx.couple.create({
        data: { userAId: newUser.id, coupleCode },
      });
      return newUser;
    });

    // Signup returns a temp token — user must enroll face or verify OTP first
    const tempToken = signTempToken({ userId: user.id, email: user.email });

    logger.info({ userId: user.id }, '[Auth] New user signed up');

    res.status(201).json({
      message: 'Account created. Please enroll your face or verify via OTP to get full access.',
      coupleCode,
      tempToken,
      user: { id: user.id, name: user.name, email: user.email },
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
        data: { userBId: newUser.id },
      });
      return newUser;
    });

    // Join also returns temp token — must complete MFA
    const tempToken = signTempToken({ userId: user.id, email: user.email });

    logger.info({ userId: user.id, coupleCode }, '[Auth] User joined couple');

    res.status(201).json({
      message: 'Joined couple. Please enroll your face or verify via OTP to get full access.',
      tempToken,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
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

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
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
    res.json({ message: 'Face verified', accessToken, refreshToken });
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
    res.json({ message: 'OTP verified', accessToken, refreshToken });
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