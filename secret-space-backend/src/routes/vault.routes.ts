import { Router } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { verifyVaultToken } from '../middlewares/verifyVaultToken';
import {
  unlockVault,
  getItems,
  createItem,
  deleteItem,
} from '../controllers/vault.controller';

const router = Router();

// Unlock — only needs JWT (biometric check happened on frontend)
router.post('/unlock', verifyJWT, unlockVault);

// All data operations need JWT + vault session token
router.get('/', verifyJWT, verifyVaultToken, getItems);
router.post('/', verifyJWT, verifyVaultToken, createItem);
router.delete('/:id', verifyJWT, verifyVaultToken, deleteItem);

export default router;
