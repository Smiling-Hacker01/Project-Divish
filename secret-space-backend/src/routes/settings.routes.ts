import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import { avatarUpload } from '../middlewares/avatarUpload';
import {
  getProfile,
  updateProfile,
  leaveSpace,
  updateFcmToken,
  updateAvatar,
  deleteAvatar,
  deleteFaceDescriptor,
  enrollFaceDescriptor,
  initPasswordChange,
  confirmPasswordChange,
} from '../controllers/settings.controller';

const router = Router();

// Strict rate-limit on sensitive auth-adjacent operations. 5 password-change inits
// and 10 OTP verifications per 15 min are well below what a real user would do
// while still letting them retry after a mistyped OTP.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password change attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const otpConfirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many OTP attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// FCM token registration — only requires auth, not a couple
router.put('/fcm-token', verifyJWT, updateFcmToken);

// Avatar — auth-only (no couple required, a solo user can still set their photo).
// Writes are scoped to req.user.userId; impossible to target another account.
router.put('/avatar', verifyJWT, avatarUpload.single('file'), updateAvatar);
router.delete('/avatar', verifyJWT, deleteAvatar);

// Face MFA — disable, or re-enroll while already authenticated. Signup-time
// enrollment still goes through /api/auth/enroll-face (which gates on email+password
// because the user isn't authenticated yet at that point). This endpoint trusts the
// JWT — it's the "settings → re-enroll" path used by FaceReenrollScreen.
router.post('/face-descriptor', verifyJWT, passwordLimiter, enrollFaceDescriptor);
router.delete('/face-descriptor', verifyJWT, deleteFaceDescriptor);

// Change-password — two-step OTP-gated flow. Rate-limited to make brute-force on
// the OTP impractical even if an attacker has a valid JWT for the account.
router.post('/password/init', verifyJWT, passwordLimiter, initPasswordChange);
router.post('/password/confirm', verifyJWT, otpConfirmLimiter, confirmPasswordChange);

// All other settings routes require couple membership
router.use(verifyJWT, requireCouple);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/leave-space', leaveSpace);

export default router;
