import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import authRouter from './routes/auth';
import modelsRouter from './routes/models';
import usersRouter from './routes/users';
import apiKeysRouter from './routes/apiKeys';
import revenueRouter from './routes/revenue';
import { logger } from './services/logger';
import { getMetrics, getContentType, collectDefaultMetrics } from './services/metrics';
import { tracingMiddleware, createSpan, saveTrace } from './middleware/tracing';
import { initializeServices, shutdownServices } from './services/service_manager';
import { getQueueStats, addInferenceJob, addBatchJob } from './services/queue_system';
import { getContainerByModel, getAllContainers, getContainersByModel, ContainerInfo } from './services/runtime_manager';
import { getClusterStatus } from './services/scheduler';
import { validateInferenceInput, validateBatchInput, validateModelId } from './services/validator';
import { AuthRequest, getUserFromRequest } from './middleware/auth';
import db from './config/db';
import path from 'path';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(tracingMiddleware);

const storageDir = path.join(__dirname, '../../storage');
app.use('/storage', express.static(storageDir));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false
});

const modelSpecificLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] as string;
    return apiKey || req.ip || 'anonymous';
  },
  message: { message: 'Rate limit exceeded for this model' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);

app.get('/health', async (req: Request, res: Response) => {
  let queueStats = { active: 0, waiting: 0, completed: 0, failed: 0 };
  let containersCount = 0;
  let gpuStatus: any = { totalNodes: 0, onlineNodes: 0, totalGpus: 0, availableGpus: 0 };
  
  try {
    queueStats = await getQueueStats();
  } catch (e) {}
  
  try {
    const containers = getAllContainers();
    containersCount = containers ? containers.length : 0;
  } catch (e) {}
  
  try {
    gpuStatus = await getClusterStatus();
  } catch (e) {}
  
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    traceId: req.traceId,
    queue: queueStats,
    containers: {
      running: containersCount
    },
    gpu: gpuStatus
  });
});

app.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', getContentType());
    res.send(await getMetrics());
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to get metrics');
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

app.get('/metrics/json', async (req: Request, res: Response) => {
  try {
    const queueStats = await getQueueStats();
    const containers = getAllContainers() || [];
    const gpuStatus = await getClusterStatus();
    const dbStats = await getDatabaseStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      queue: queueStats,
      containers: {
        total: containers.length,
        byModel: groupByModel(containers)
      },
      gpu: gpuStatus,
      database: dbStats,
      application: {}
    });
  } catch (error) {
      application: metrics.getMetrics()
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to get metrics');
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

app.get('/trace/:traceId', async (req: Request, res: Response) => {
  const { traceId } = req.params;
  
  try {
    const result = await db.query(
      `SELECT * FROM request_traces WHERE trace_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [traceId]
    );
    
    res.json({
      traceId,
      spans: result.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get trace' });
  }
});

app.get('/queue/:modelId/stats', async (req: Request, res: Response) => {
  const { modelId } = req.params;
  
  try {
    const stats = await getQueueStats(modelId);
    const containers = getContainersByModel(modelId);
    
    res.json({
      modelId,
      queue: stats,
      containers: containers.map((c: ContainerInfo) => ({
        containerId: c.containerId,
        status: c.status,
        currentLoad: c.currentLoad,
        requestCount: c.requestCount
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

app.post('/inference/:modelId', modelSpecificLimiter, async (req: AuthRequest, res: Response) => {
  const { modelId } = req.params;
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
  if (!validateModelId(modelId)) {
    return res.status(400).json({ error: 'Invalid model ID format' });
  }
  
  const validation = validateInferenceInput(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error || 'Invalid input' });
  }
  
  const span = createSpan('inference_request', req.traceId, req.spanId);
  
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const result = await addInferenceJob({
      modelId,
      userId: user.userId.toString(),
      input: validation.data?.input || {},
      apiKeyId: req.apiKeyId || '',
      priority: 'normal',
      requestId
    });
    
    span.end(true);
    await saveTrace(req.traceId!, {
      model_id: modelId,
      user_id: user.userId,
      latency: 0,
      status_code: 202
    });
    
    res.json({
      requestId,
      traceId: req.traceId,
      status: 'queued',
      jobId: result.id
    });
  } catch (error) {
    span.setError(error as Error);
    span.end(false);
    logger.error({ modelId, error: (error as Error).message }, 'Inference request failed');
    res.status(500).json({ error: 'Failed to queue inference request' });
  }
});

app.post('/batch/:modelId', modelSpecificLimiter, async (req: AuthRequest, res: Response) => {
  const { modelId } = req.params;
  const batchId = uuidv4();
  
  if (!validateModelId(modelId)) {
    return res.status(400).json({ error: 'Invalid model ID format' });
  }
  
  const validation = validateBatchInput(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error || 'Invalid input' });
  }
  
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const span = createSpan('batch_inference_request', req.traceId, req.spanId);
  
  try {
    const result = await addBatchJob({
      modelId,
      inputs: validation.data?.inputs || [],
      userId: user.userId.toString(),
      apiKeyId: req.apiKeyId || '',
      batchId
    });
    
    span.end(true);
    await saveTrace(req.traceId!, {
      model_id: modelId,
      user_id: user.userId,
      latency: 0,
      status_code: 202
    });
    
    res.json({
      batchId,
      traceId: req.traceId,
      status: 'queued',
      jobId: result.id,
      inputCount: validation.data?.inputs?.length || 0
    });
  } catch (error) {
    span.setError(error as Error);
    span.end(false);
    logger.error({ modelId, error: (error as Error).message }, 'Batch inference request failed');
    res.status(500).json({ error: 'Failed to queue batch inference request' });
  }
});

app.get('/streaming/:modelId', (req: Request, res: Response) => {
  const { modelId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  const traceIdHeader = req.headers['x-trace-id'];
  if (traceIdHeader) {
    res.setHeader('X-Trace-ID', traceIdHeader as string);
  }
  
  const sendChunk = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  sendChunk({ type: 'connected', modelId, traceId: req.traceId });
  
  let counter = 0;
  const interval = setInterval(() => {
    counter++;
    sendChunk({ 
      type: 'token', 
      content: `token_${counter}`,
      sequence: counter 
    });
    
    if (counter >= 10) {
      clearInterval(interval);
      sendChunk({ type: 'done', total: counter });
      res.end();
    }
  }, 100);
  
  req.on('close', () => {
    clearInterval(interval);
  });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info({
    traceId: req.traceId,
    spanId: req.spanId,
    method: req.method,
    path: req.path,
    ip: req.ip
  }, 'API request');
  next();
});

app.use('/auth', authRouter);
app.use('/models', modelsRouter);
app.use('/users', usersRouter);
app.use('/api-keys', apiKeysRouter);
app.use('/revenue', revenueRouter);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error({ 
    error: err.message,
    stack: err.stack,
    path: req.path,
    traceId: req.traceId
  }, 'Unhandled error');
  
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    traceId: req.traceId,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

async function getDatabaseStats() {
  try {
    const result = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM models) as models,
        (SELECT COUNT(*) FROM api_keys) as api_keys,
        (SELECT COUNT(*) FROM usage_events) as usage_events,
        (SELECT COUNT(*) FROM containers) as containers,
        (SELECT COUNT(*) FROM gpu_nodes) as gpu_nodes
    `);
    return result.rows[0];
  } catch {
    return { users: 0, models: 0, api_keys: 0, usage_events: 0, containers: 0, gpu_nodes: 0 };
  }
}

function groupByModel(containers: any[]) {
  const grouped: Record<string, number> = {};
  for (const c of containers) {
    grouped[c.modelId] = (grouped[c.modelId] || 0) + 1;
  }
  return grouped;
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await shutdownServices();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await shutdownServices();
  process.exit(0);
});

async function startServer() {
  try {
    await collectDefaultMetrics();
    await initializeServices();
    
    app.listen(port, () => {
      logger.info({ port, traceId: 'startup' }, 'Codexon Backend listening');
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();

export default app;
