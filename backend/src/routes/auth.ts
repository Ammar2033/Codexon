import { Router } from 'express';
import { register, login, getMe, logout } from '../controllers/auth';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authMiddleware, getMe);

export default router;
