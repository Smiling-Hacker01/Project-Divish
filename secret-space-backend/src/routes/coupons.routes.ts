import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import {
  getCoupons,
  getCoupon,
  createCoupon,
  updateStatus,
} from '../controllers/coupons.controller';

const router = Router();

router.use(verifyJWT, requireCouple);

router.get('/', getCoupons);
router.get('/:id', getCoupon);
router.post('/', createCoupon);
router.patch('/:id/status', updateStatus);

export default router;
