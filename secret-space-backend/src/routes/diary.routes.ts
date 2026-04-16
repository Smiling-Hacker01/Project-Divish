import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import {
  getEntries,
  getEntry,
  createEntry,
  likeEntry,
  addComment,
  deleteEntry,
} from '../controllers/diary.controller';

const router = Router();

router.use(verifyJWT, requireCouple);

router.get('/', getEntries);
router.get('/:id', getEntry);
router.post('/', createEntry);
router.post('/:id/like', likeEntry);
router.post('/:id/comments', addComment);
router.delete('/:id', deleteEntry);

export default router;
