import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import {
  getEntries,
  getEntry,
  createEntry,
  editEntry,
  likeEntry,
  addComment,
  deleteEntry,
  reactToComment,
} from '../controllers/diary.controller';

const router = Router();

router.use(verifyJWT, requireCouple);

router.get('/', getEntries);
router.get('/:id', getEntry);
router.post('/', createEntry);
router.put('/:id', editEntry);
router.post('/:id/like', likeEntry);
router.post('/:id/comments', addComment);
router.post('/:id/comments/:commentId/react', reactToComment);
router.delete('/:id', deleteEntry);

export default router;
