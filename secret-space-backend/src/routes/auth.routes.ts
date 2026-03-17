import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyJWT, verifyTempJWT } from '../middlewares/auth';
import {
    signup,
    enrollFace,
    login,
    faceVerify,
    otpRequest,
    otpVerify,
    join,
    refresh,
    logout,
} from '../controllers/auth.controller';

const router = Router();

// Strict rate limit for auth endpoints — 10 attempts per 15 min per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// More generous limit for OTP requests — prevent spam
const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    message: { error: 'Too many OTP requests. Please wait 10 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ── Public routes ──────────────────────────────────────────────────────────────
router.post('/signup', authLimiter, signup);
router.post('/join', authLimiter, join);
router.post('/refresh', refresh);

// ── MFA Step 1 — password check ───────────────────────────────────────────────
router.post('/login', authLimiter, login);

// ── MFA Step 2 — requires temp token issued by /login ─────────────────────────
router.post('/face-verify', verifyTempJWT, faceVerify);   // Primary: face
router.post('/otp-request', otpLimiter, verifyTempJWT, otpRequest); // Fallback: trigger OTP
router.post('/otp-verify', verifyTempJWT, otpVerify);     // Fallback: verify OTP

// ── Protected — requires full JWT ─────────────────────────────────────────────
router.post('/enroll-face', enrollFace); // No JWT needed — uses userId+password from body
router.post('/logout', verifyJWT, logout);

export default router;