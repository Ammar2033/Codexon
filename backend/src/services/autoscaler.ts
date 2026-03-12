import { getRunningContainers, getContainerStatus, ContainerInfo } from './docker';
import { logger, metrics } from './logger';
import { getQueueStats } from './queue';
import db from '../config/db';

export interface ScalingConfig {
  minReplicas: number;
  maxReplicas: number;
  targetCPUUtilization: number;
  targetMemoryUtilization: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownPeriod: number;
}

const DEFAULT_SCALING_CONFIG: ScalingConfig = {
  minReplicas: 1,
  maxReplicas: 5,
  targetCPUUtilization: 70,
  targetMemoryUtilization: 80,
  scaleUpThreshold: 10,
  scaleDownThreshold: 2,
  cooldownPeriod: 300000
};

const lastScaleTime: Map<string, number> = new Map();
let scalingInterval: NodeJS.Timeout | null = null;

export async function startAutoscaler(intervalMs: number = 60000) {
  logger.info({ intervalMs }, 'Starting autoscaler');
  
  scalingInterval = setInterval(async () => {
    try {
      await performAutoscaling();
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Autoscaling error');
    }
  }, intervalMs);
}

export function stopAutoscaler() {
  if (scalingInterval) {
    clearInterval(scalingInterval);
    scalingInterval = null;
    logger.info('Autoscaler stopped');
  }
}

async function performAutoscaling() {
  const queueStats = await getQueueStats();
  const containers = getRunningContainers();
  
  metrics.setActiveContainers(containers.length);
  
  logger.info({
    queueWaiting: queueStats.waiting,
    queueActive: queueStats.active,
    containersRunning: containers.length
  }, 'Autoscaling check');

  for (const container of containers) {
    await scaleModelIfNeeded(container);
  }
}

async function scaleModelIfNeeded(container: ContainerInfo) {
  const modelId = container.modelId;
  const now = Date.now();
  
  const lastScale = lastScaleTime.get(modelId) || 0;
  if (now - lastScale < DEFAULT_SCALING_CONFIG.cooldownPeriod) {
    return;
  }

  const recentUsage = await getRecentUsage(modelId);
  
  if (recentUsage.avgRequestsPerMinute > DEFAULT_SCALING_CONFIG.scaleUpThreshold) {
    logger.info({ 
      modelId, 
      avgRequests: recentUsage.avgRequestsPerMinute 
    }, 'Scale up triggered');
    
    lastScaleTime.set(modelId, now);
  }
  
  if (recentUsage.avgRequestsPerMinute < DEFAULT_SCALING_CONFIG.scaleDownThreshold) {
    logger.info({ 
      modelId, 
      avgRequests: recentUsage.avgRequestsPerMinute 
    }, 'Scale down triggered');
    
    lastScaleTime.set(modelId, now);
  }
}

async function getRecentUsage(modelId: string) {
  const result = await db.query(`
    SELECT 
      COUNT(*) as total_requests,
      AVG(latency) as avg_latency
    FROM usage_events 
    WHERE model_id = $1 
      AND timestamp > NOW() - INTERVAL '10 minutes'
  `, [modelId]);

  const totalRequests = parseInt(result.rows[0]?.total_requests) || 0;
  const avgRequestsPerMinute = totalRequests / 10;
  const avgLatency = parseFloat(result.rows[0]?.avg_latency) || 0;

  return {
    totalRequests,
    avgRequestsPerMinute,
    avgLatency
  };
}

export async function prewarmModel(modelId: string): Promise<void> {
  logger.info({ modelId }, 'Pre-warming model container');
  
  const modelResult = await db.query(
    'SELECT * FROM models WHERE id = $1',
    [modelId]
  );
  
  if (modelResult.rows.length === 0) {
    throw new Error('Model not found');
  }

  const versionResult = await db.query(
    'SELECT storage_path, codexon_config FROM model_versions WHERE model_id = $1',
    [modelId]
  );
  
  const storagePath = versionResult.rows[0].storage_path;
  const config = versionResult.rows[0].codexon_config;

  const { buildAndStartContainer } = await import('./docker');
  
  try {
    await buildAndStartContainer({
      modelId,
      modelVersion: '1.0',
      storagePath,
      codexonConfig: config,
      port: 9000 + Math.floor(Math.random() * 1000)
    });
    
    logger.info({ modelId }, 'Model pre-warmed successfully');
  } catch (error) {
    logger.error({ modelId, error: (error as Error).message }, 'Failed to pre-warm model');
    throw error;
  }
}

export interface BatchInferenceRequest {
  modelId: string;
  inputs: any[];
  callbackUrl?: string;
}

export async function processBatchInference(request: BatchInferenceRequest): Promise<any[]> {
  const { modelId, inputs, callbackUrl } = request;
  
  logger.info({ modelId, batchSize: inputs.length }, 'Processing batch inference');
  
  const results: any[] = [];
  
  for (const input of inputs) {
    try {
      const { runInference } = await import('./docker');
      const result = await runInference(modelId, input);
      results.push({ success: true, result });
    } catch (error) {
      results.push({ success: false, error: (error as Error).message });
    }
  }

  if (callbackUrl) {
    try {
      const axios = require('axios');
      await axios.post(callbackUrl, { modelId, results });
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Failed to send callback');
    }
  }

  logger.info({ modelId, successCount: results.filter(r => r.success).length }, 'Batch inference complete');
  
  return results;
}