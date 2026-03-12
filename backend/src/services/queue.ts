import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import axios from 'axios';
import db from '../config/db';
import { logger, metrics } from './logger';
import { runInference as dockerRunInference } from './docker';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

const connection = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null
});

export const inferenceQueue = new Queue('inference', { connection });

export interface InferenceJobData {
  modelId: string;
  userId: string;
  input: any;
  apiKeyId: string;
}

export interface InferenceJobResult {
  success: boolean;
  result?: any;
  error?: string;
  latency: number;
  price: number;
  creatorRevenue: number;
  platformCommission: number;
}

export function addInferenceJob(data: InferenceJobData): Promise<Job<InferenceJobData>> {
  return inferenceQueue.add('inference-request', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: 1000,
    removeOnFail: 100
  });
}

export const inferenceWorker = new Worker<InferenceJobData, InferenceJobResult>(
  'inference',
  async (job) => {
    const { modelId, userId, input, apiKeyId } = job.data;
    const startTime = Date.now();

    logger.info({ modelId, jobId: job.id }, 'Processing inference job');

    try {
      const modelResult = await db.query(
        'SELECT * FROM models WHERE id = $1 AND status = $2',
        [modelId, 'published']
      );

      if (modelResult.rows.length === 0) {
        throw new Error('Model not found or not published');
      }

      const versionResult = await db.query(
        'SELECT codexon_config FROM model_versions WHERE model_id = $1',
        [modelId]
      );

      const config = versionResult.rows[0]?.codexon_config;
      const price = parseFloat(config?.billing?.price_per_request) || 0.002;
      const modelOwnerId = modelResult.rows[0].owner_id;

      const result = await dockerRunInference(modelId, input);

      const latency = Date.now() - startTime;
      const requestSize = JSON.stringify(input).length;

      await db.query(
        `INSERT INTO usage_events (model_id, user_id, latency, request_size) 
         VALUES ($1, $2, $3, $4)`,
        [modelId, userId, latency, requestSize]
      );

      const platformCommission = price * 0.2;
      const creatorRevenue = price - platformCommission;

      await db.query(
        `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`,
        [creatorRevenue, modelOwnerId]
      );

      await db.query(
        `INSERT INTO transactions (wallet_id, amount, type, related_usage_event) 
         SELECT w.id, $1, 'revenue', ue.id 
         FROM wallets w 
         LEFT JOIN usage_events ue ON ue.model_id = $2 AND ue.user_id = $3
         WHERE w.user_id = $4`,
        [creatorRevenue, modelId, userId, modelOwnerId]
      );

      metrics.recordRequest();
      metrics.addRevenue(creatorRevenue);

      return {
        success: true,
        result,
        latency,
        price,
        creatorRevenue,
        platformCommission
      };
    } catch (error) {
      metrics.recordError();
      logger.error({ modelId, error: (error as Error).message }, 'Inference job failed');
      
      throw error;
    }
  },
  {
    connection,
    concurrency: 10,
    limiter: {
      max: 100,
      duration: 1000
    }
  }
);

inferenceWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, latency: result.latency }, 'Inference job completed');
});

inferenceWorker.on('failed', (job, error) => {
  logger.error({ jobId: job.id, error: error.message }, 'Inference job failed');
});

export async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    inferenceQueue.getWaitingCount(),
    inferenceQueue.getActiveCount(),
    inferenceQueue.getCompletedCount(),
    inferenceQueue.getFailedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active
  };
}

export async function getJobHistory(modelId: string, limit: number = 50) {
  const result = await db.query(
    `SELECT ue.*, m.name as model_name 
     FROM usage_events ue 
     JOIN models m ON ue.model_id = m.id 
     WHERE ue.model_id = $1 
     ORDER BY ue.timestamp DESC 
     LIMIT $2`,
    [modelId, limit]
  );

  return result.rows;
}