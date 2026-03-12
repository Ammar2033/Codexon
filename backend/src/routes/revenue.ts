import { Router } from 'express';
import * as revenueController from '../controllers/revenue';
import { authMiddleware, requireCreator } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, requireCreator, revenueController.getRevenue);
router.get('/transactions', authMiddleware, requireCreator, revenueController.getTransactions);

export default router;