import { Router } from 'express';
import * as apiKeyController from '../controllers/apiKeys';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/create', authMiddleware, apiKeyController.createApiKey);
router.get('/', authMiddleware, apiKeyController.getApiKeys);
router.delete('/:id', authMiddleware, apiKeyController.deleteApiKey);

export default router;