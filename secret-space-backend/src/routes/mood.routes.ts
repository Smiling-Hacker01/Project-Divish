import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import { upsertMood, getCoupleMoods } from '../controllers/mood.controller';

const router = Router();

router.use(verifyJWT, requireCouple);

router.get('/', getCoupleMoods);
router.post('/', upsertMood);

export default router;
