import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import {
  getHomeData,
  updateCouplePhoto,
  removeCouplePhoto,
} from '../controllers/dashboard.controller';

const router = Router();

router.use(verifyJWT, requireCouple);

router.get('/', getHomeData);
router.post('/photo', updateCouplePhoto);
router.delete('/photo', removeCouplePhoto);

export default router;
