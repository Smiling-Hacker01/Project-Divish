import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import {
  getCoupons,
  getCoupon,
  createCoupon,
  updateStatus,
  getPendingFulfillments,
  fulfillCoupon,
  addReview,
} from '../controllers/coupons.controller';

const router = Router();

router.use(verifyJWT, requireCouple);

router.get('/', getCoupons);
router.get('/pending-fulfillments', getPendingFulfillments);
router.get('/:id', getCoupon);
router.post('/', createCoupon);
router.patch('/:id/status', updateStatus);
router.patch('/:id/fulfill', fulfillCoupon);
router.post('/:id/review', addReview);

export default router;
