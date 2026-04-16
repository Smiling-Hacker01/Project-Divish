import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import {
  getProfile,
  updateProfile,
  unlinkPartner,
} from '../controllers/settings.controller';

const router = Router();

router.use(verifyJWT, requireCouple);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/unlink', unlinkPartner);

export default router;
