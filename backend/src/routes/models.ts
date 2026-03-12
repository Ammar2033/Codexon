import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import * as modelController from '../controllers/models';
import { authMiddleware, requireCreator, apiKeyAuth } from '../middleware/auth';

const router = Router();
const upload = multer({ dest: 'storage/uploads/', limits: { fileSize: 500 * 1024 * 1024 } });

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const inferenceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.headers.authorization?.replace('Bearer ', '') || req.ip,
  message: { message: 'Inference rate limit exceeded' }
});

const uploadLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 10,
  message: { message: 'Upload limit exceeded, please try again later' }
});

router.get('/marketplace', modelController.getMarketplaceModels);
router.get('/my', authMiddleware, requireCreator, modelController.getMyModels);
router.get('/:id', modelController.getModelDetails);
router.get('/:id/usage', authMiddleware, requireCreator, modelController.getModelUsage);
router.get('/:id/logs', authMiddleware, requireCreator, modelController.getModelLogs);
router.get('/queue/stats', modelController.getQueueStatsEndpoint);

router.post('/upload', authMiddleware, requireCreator, uploadLimiter, upload.single('model'), modelController.uploadModel);
router.post('/:id/deploy', authMiddleware, requireCreator, generalLimiter, modelController.deployModel);
router.post('/:id/publish', authMiddleware, requireCreator, modelController.publishModel);
router.post('/:id/test', authMiddleware, requireCreator, modelController.testModel);
router.post('/:id/stop', authMiddleware, requireCreator, modelController.stopModel);
router.post('/:id/restart', authMiddleware, requireCreator, modelController.restartModel);
router.delete('/:id', authMiddleware, requireCreator, modelController.deleteModel);

router.post('/:id/inference', apiKeyAuth, inferenceLimiter, modelController.runInference);
router.get('/:id/inference/:jobId', apiKeyAuth, modelController.getInferenceStatus);

export default router;