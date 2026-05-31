import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import {
  getHomeData,
  refreshReason,
  updateCouplePhoto,
  removeCouplePhoto,
} from '../controllers/dashboard.controller';

const router = Router();

router.use(verifyJWT, requireCouple);

router.get('/', getHomeData);
router.post('/refresh-reason', refreshReason);
router.post('/photo', updateCouplePhoto);
router.delete('/photo', removeCouplePhoto);

export default router;
