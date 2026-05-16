import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import { avatarUpload } from '../middlewares/avatarUpload';
import {
  getProfile,
  updateProfile,
  unlinkPartner,
  updateFcmToken,
  updateAvatar,
  deleteAvatar,
} from '../controllers/settings.controller';

const router = Router();

// FCM token registration — only requires auth, not a couple
router.put('/fcm-token', verifyJWT, updateFcmToken);

// Avatar — auth-only (no couple required, a solo user can still set their photo).
// Writes are scoped to req.user.userId; impossible to target another account.
router.put('/avatar', verifyJWT, avatarUpload.single('file'), updateAvatar);
router.delete('/avatar', verifyJWT, deleteAvatar);

// All other settings routes require couple membership
router.use(verifyJWT, requireCouple);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/unlink', unlinkPartner);

export default router;
