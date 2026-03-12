import Redis from 'ioredis';
import { logger } from '../logger';
import { getPoolStatus, scalePool, configurePool, PoolConfig } from '../container_pool';
import { ContainerInfo, getAllContainers } from '../runtime_manager/container_allocator';

const redis = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: 6379 });

export interface AutoscalingConfig {
  enabled: boolean;
  minReplicas: number;
  maxReplicas: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  scaleUpCooldown: number;
  scaleDownCooldown: number;
  targetLatency: number;
  queueDepthThreshold: number;
}

const DEFAULT_AUTOSCALING_CONFIG: AutoscalingConfig = {
  enabled: true,
  minReplicas: 1,
  maxReplicas: 10,
  scaleUpThreshold: 10,
  scaleDownThreshold: 2,
  scaleUpCooldown: 120000,
  scaleDownCooldown: 300000,
  targetLatency: 500,
  queueDepthThreshold: 20
};

const modelConfigs: Map<string, AutoscalingConfig> = new Map();
const lastScaleTime: Map<string, number> = new Map();
let autoscalingInterval: NodeJS.Timeout | null = null;

export function configureAutoscaling(modelId: string, config: Partial<AutoscalingConfig>): void {
  modelConfigs.set(modelId, { ...DEFAULT_AUTOSCALING_CONFIG, ...config });
  logger.info({ modelId, config }, 'Autoscaling configured');
}

export function disableAutoscaling(modelId: string): void {
  const config = modelConfigs.get(modelId);
  if (config) {
    config.enabled = false;
  }
}

export async function startAutoscaler(intervalMs: number = 30000): Promise<void> {
  if (autoscalingInterval) return;
  
  logger.info({ intervalMs }, 'Starting autoscaler');
  
  autoscalingInterval = setInterval(async () => {
    try {
      await performAutoscaling();
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Autoscaling error');
    }
  }, intervalMs);
}

export function stopAutoscaler(): void {
  if (autoscalingInterval) {
    clearInterval(autoscalingInterval);
    autoscalingInterval = null;
    logger.info('Autoscaler stopped');
  }
}

async function performAutoscaling(): Promise<void> {
  const models = Array.from(modelConfigs.keys());
  
  for (const modelId of models) {
    const config = modelConfigs.get(modelId);
    if (!config || !config.enabled) continue;

    try {
      await scaleModelIfNeeded(modelId, config);
    } catch (error) {
      logger.error({ modelId, error: (error as Error).message }, 'Error scaling model');
    }
  }
}

async function scaleModelIfNeeded(modelId: string, config: AutoscalingConfig): Promise<void> {
  const now = Date.now();
  const lastScale = lastScaleTime.get(modelId) || 0;
  
  const [queueDepth, avgLatency, poolStatus] = await Promise.all([
    getQueueDepth(modelId),
    getAverageLatency(modelId),
    getPoolStatus(modelId)
  ]);

  const currentReplicas = poolStatus.size;
  
  logger.info({
    modelId,
    queueDepth,
    avgLatency,
    currentReplicas,
    targetLatency: config.targetLatency
  }, 'Autoscaling check');

  if (shouldScaleUp(config, queueDepth, avgLatency, currentReplicas)) {
    if (now - lastScale > config.scaleUpCooldown) {
      const newReplicas = Math.min(currentReplicas + Math.ceil(queueDepth / 10), config.maxReplicas);
      lastScaleTime.set(modelId, now);
      
      logger.info({ modelId, currentReplicas, newReplicas }, 'Scaling up');
    }
  } else if (shouldScaleDown(config, queueDepth, avgLatency, currentReplicas)) {
    if (now - lastScale > config.scaleDownCooldown) {
      const newReplicas = Math.max(currentReplicas - 1, config.minReplicas);
      lastScaleTime.set(modelId, now);
      
      logger.info({ modelId, currentReplicas, newReplicas }, 'Scaling down');
    }
  }
}

function shouldScaleUp(config: AutoscalingConfig, queueDepth: number, avgLatency: number, currentReplicas: number): boolean {
  if (currentReplicas >= config.maxReplicas) return false;
  
  const queueTrigger = queueDepth > config.scaleUpThreshold * currentReplicas;
  const latencyTrigger = avgLatency > config.targetLatency && currentReplicas < config.maxReplicas;
  
  return queueTrigger || latencyTrigger;
}

function shouldScaleDown(config: AutoscalingConfig, queueDepth: number, avgLatency: number, currentReplicas: number): boolean {
  if (currentReplicas <= config.minReplicas) return false;
  
  return queueDepth === 0 && avgLatency < config.targetLatency * 0.5;
}

async function getQueueDepth(modelId: string): Promise<number> {
  const key = `codexon:queue:model:${modelId}:waiting`;
  const count = await redis.llen(key);
  return count;
}

async function getAverageLatency(modelId: string): Promise<number> {
  const key = `codexon:metrics:latency:${modelId}:recent`;
  const data = await redis.lrange(key, 0, 99);
  
  if (data.length === 0) return 0;
  
  const latencies = data.map(d => parseFloat(d)).filter(l => !isNaN(l));
  if (latencies.length === 0) return 0;
  
  return latencies.reduce((a, b) => a + b, 0) / latencies.length;
}

export async function triggerManualScale(modelId: string, replicas: number, config: ContainerConfig): Promise<void> {
  const autoscalingConfig = modelConfigs.get(modelId) || DEFAULT_AUTOSCALING_CONFIG;
  const clampedReplicas = Math.min(Math.max(replicas, autoscalingConfig.minReplicas), autoscalingConfig.maxReplicas);
  
  await scalePool(modelId, clampedReplicas, config);
  lastScaleTime.set(modelId, Date.now());
  
  logger.info({ modelId, replicas: clampedReplicas }, 'Manual scale triggered');
}

export async function getAutoscalingMetrics(modelId: string): Promise<{
  currentReplicas: number;
  queueDepth: number;
  avgLatency: number;
  lastScaleTime: number | null;
  config: AutoscalingConfig;
}> {
  const [poolStatus, queueDepth, avgLatency] = await Promise.all([
    getPoolStatus(modelId),
    getQueueDepth(modelId),
    getAverageLatency(modelId)
  ]);

  return {
    currentReplicas: poolStatus.size,
    queueDepth,
    avgLatency,
    lastScaleTime: lastScaleTime.get(modelId) || null,
    config: modelConfigs.get(modelId) || DEFAULT_AUTOSCALING_CONFIG
  };
}

export function getAllAutoscalingStatuses(): Map<string, ReturnType<typeof getAutoscalingMetrics>> {
  const statuses = new Map();
  
  for (const modelId of modelConfigs.keys()) {
    getAutoscalingMetrics(modelId).then(status => {
      statuses.set(modelId, status);
    });
  }
  
  return statuses;
}

export interface ContainerConfig {
  modelId: string;
  modelVersion: string;
  storagePath: string;
  codexonConfig: any;
  port: number;
}