import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyJWT } from '../middlewares/auth';
import { verifyVaultToken } from '../middlewares/verifyVaultToken';
import { vaultUpload } from '../middlewares/vaultUpload';
import {
  unlockVault,
  getItems,
  createItem,
  deleteItem,
  uploadMedia,
} from '../controllers/vault.controller';

const router = Router();

// Bound abuse of the write-heavy endpoints. 30 uploads/min and 60 creates/min
// comfortably cover a 50-photo batch import (3-concurrent client policy means real
// throughput tops out around 30 inserts/min anyway). Unlock is intentionally tight.
const unlockLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Too many unlock attempts. Wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many uploads. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many vault actions. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Unlock — only needs JWT (biometric check happened on frontend).
router.post('/unlock', unlockLimiter, verifyJWT, unlockVault);

// Multipart upload — JWT + vault token, multer parses before the controller.
router.post('/upload', verifyJWT, verifyVaultToken, uploadLimiter, vaultUpload.single('file'), uploadMedia);

// All other data operations need JWT + vault session token.
router.get('/', verifyJWT, verifyVaultToken, getItems);
router.post('/', verifyJWT, verifyVaultToken, writeLimiter, createItem);
router.delete('/:id', verifyJWT, verifyVaultToken, writeLimiter, deleteItem);

export default router;
