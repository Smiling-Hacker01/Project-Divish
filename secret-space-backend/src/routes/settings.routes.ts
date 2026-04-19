import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import {
  getProfile,
  updateProfile,
  unlinkPartner,
  updateFcmToken,
} from '../controllers/settings.controller';

const router = Router();

// FCM token registration — only requires auth, not a couple
router.put('/fcm-token', verifyJWT, updateFcmToken);

// All other settings routes require couple membership
router.use(verifyJWT, requireCouple);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/unlink', unlinkPartner);

export default router;
