import { z } from 'zod';

// ── Auth Schemas ───────────────────────────────────────────────────────────────

export const signupSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be at most 50 characters')
    .transform((v) => v.trim().replace(/<[^>]*>/g, '')),
  email: z
    .string()
    .email('Invalid email address')
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  anniversaryDate: z.string().optional(),
});

export const joinSchema = signupSchema.omit({ anniversaryDate: true }).extend({
  coupleCode: z
    .string()
    .min(1, 'coupleCode is required')
    .transform((v) => v.toUpperCase().trim()),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
});

export const enrollFaceSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
  faceImage: z.string().min(100, 'faceImage (base64) is required'),
});

export const faceVerifySchema = z.object({
  faceImage: z.string().min(100, 'faceImage (base64) is required'),
});

export const otpVerifySchema = z.object({
  otp: z
    .string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d{6}$/, 'OTP must be numeric'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

// ── Diary Schemas ──────────────────────────────────────────────────────────────

export const createDiarySchema = z.object({
  type: z.enum(['text', 'image', 'video']),
  content: z.string().optional(),
  mediaUrl: z.string().optional(),
});

export const likeEntrySchema = z.object({
  liked: z.boolean(),
});

export const addCommentSchema = z.object({
  text: z.string().min(1, 'Comment text is required').max(1000),
});

export const reactToCommentSchema = z.object({
  emoji: z.string().min(1, 'Emoji is required').max(10), // Allow diverse emoji flags/ligatures up to 10 chars
});

// ── Mood Schema ────────────────────────────────────────────────────────────────

export const upsertMoodSchema = z.object({
  mood: z.string().min(1, 'Mood is required'),
});

// ── Coupon Schemas ─────────────────────────────────────────────────────────────

export const createCouponSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  description: z.string().max(500).optional(),
  expiresAt: z.string().optional(),
});

export const updateCouponStatusSchema = z.object({
  status: z.enum(['active', 'pending', 'used', 'fulfilled', 'expired']),
});

export const couponReviewSchema = z.object({
  rating: z.number().int().min(1, 'Rating must be 1-5').max(5, 'Rating must be 1-5'),
  text: z.string().max(500).optional(),
});

// ── Vault Schema ───────────────────────────────────────────────────────────────

export const createVaultItemSchema = z.object({
  fileType: z.enum(['image', 'video']),
  fileData: z.string().min(1, 'fileData (base64) is required'),
});

// ── LoveBot Schemas ────────────────────────────────────────────────────────────

export const updateLoveBotSettingsSchema = z.object({
  mode: z.enum(['off', 'daily', 'surprise']),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM format'),
  userBAccessGranted: z.boolean().optional(),
});

export const addReasonSchema = z.object({
  text: z.string().min(1, 'Reason text is required').max(500),
  forPartner: z.boolean().default(true),
});

// ── Dashboard Schemas ──────────────────────────────────────────────────────────

export const updateCouplePhotoSchema = z.object({
  image: z.string().min(1, 'Base64 image data is required'),
});

// ── Settings Schemas ───────────────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50)
    .transform((v) => v.trim().replace(/<[^>]*>/g, ''))
    .optional(),
});
