import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyJWT } from '../middlewares/auth';
import { requireCouple } from '../middlewares/requireCouple';
import { diaryUpload } from '../middlewares/diaryUpload';
import {
  getEntries,
  getEntry,
  createEntry,
  editEntry,
  likeEntry,
  addComment,
  deleteEntry,
  reactToComment,
  uploadMedia,
} from '../controllers/diary.controller';

const router = Router();

// Bound abuse of the write-heavy endpoints. Both reads (feed/detail) and reactions
// stay unlimited — they're the hot path and Postgres handles the load.
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many diary actions. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many uploads. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(verifyJWT, requireCouple);

// Multipart upload — clients upload the file here first, then POST /api/diary with the
// returned mediaUrl. Multer runs before the controller to populate req.file.
router.post('/upload', uploadLimiter, diaryUpload.single('file'), uploadMedia);

router.get('/', getEntries);
router.get('/:id', getEntry);
router.post('/', writeLimiter, createEntry);
router.put('/:id', writeLimiter, editEntry);
router.post('/:id/like', likeEntry);
router.post('/:id/comments', writeLimiter, addComment);
router.post('/:id/comments/:commentId/react', reactToComment);
router.delete('/:id', writeLimiter, deleteEntry);

export default router;
