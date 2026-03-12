import { Router } from 'express';
import { becomeCreator } from '../controllers/users';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/become-creator', authMiddleware, becomeCreator);

export default router;
