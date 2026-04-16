import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import {
  getSettings,
  updateSettings,
  addReason,
  deleteReason,
} from '../controllers/lovebot.controller';

const router = Router();

router.use(verifyJWT, requireCouple);

router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.post('/reasons', addReason);
router.delete('/reasons/:id', deleteReason);

export default router;
