import Redis from 'ioredis';
import { logger } from '../logger';
import { getPoolStatus, scalePool, configurePool, PoolConfig, getPoolMetrics } from './container_pool';
import { scheduler } from './scheduler';

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
  gpuUtilizationThreshold: number;
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
  queueDepthThreshold: 20,
  gpuUtilizationThreshold: 80
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
  if (config) config.enabled = false;
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
  for (const [modelId, config] of modelConfigs) {
    if (!config.enabled) continue;

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
  
  const [queueDepth, avgLatency, poolStatus, gpuUsage] = await Promise.all([
    getQueueDepth(modelId),
    getAverageLatency(modelId),
    getPoolStatus(modelId),
    getGpuUtilization(modelId)
  ]);

  const currentReplicas = poolStatus.size;
  
  logger.info({
    modelId,
    queueDepth,
    avgLatency,
    currentReplicas,
    gpuUsage,
    targetLatency: config.targetLatency
  }, 'Autoscaling check');

  const shouldScaleUp = queueDepth > config.scaleUpThreshold * currentReplicas ||
    avgLatency > config.targetLatency ||
    gpuUsage > config.gpuUtilizationThreshold;

  const shouldScaleDown = queueDepth === 0 && 
    avgLatency < config.targetLatency * 0.5 && 
    currentReplicas > config.minReplicas;

  if (shouldScaleUp && (now - lastScale > config.scaleUpCooldown)) {
    const newReplicas = Math.min(currentReplicas + Math.ceil(queueDepth / 10), config.maxReplicas);
    lastScaleTime.set(modelId, now);
    
    logger.info({ modelId, currentReplicas, newReplicas, reason: 'scale_up' }, 'Scaling up');
  }
  
  if (shouldScaleDown && (now - lastScale > config.scaleDownCooldown)) {
    const newReplicas = Math.max(currentReplicas - 1, config.minReplicas);
    lastScaleTime.set(modelId, now);
    
    logger.info({ modelId, currentReplicas, newReplicas, reason: 'scale_down' }, 'Scaling down');
  }
}

async function getQueueDepth(modelId: string): Promise<number> {
  try {
    const queue = await import('./queue_system');
    const stats = await queue.getQueueStats(modelId);
    return stats.waiting;
  } catch {
    return 0;
  }
}

async function getAverageLatency(modelId: string): Promise<number> {
  const key = `codexon:metrics:latency:${modelId}:recent`;
  const data = await redis.lrange(key, 0, 99);
  
  if (data.length === 0) return 0;
  
  const latencies = data.map(d => parseFloat(d)).filter(l => !isNaN(l));
  return latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
}

async function getGpuUtilization(modelId: string): Promise<number> {
  const allocations = await scheduler.getGpuAllocations(modelId);
  
  if (allocations.length === 0) return 0;
  
  let totalUtil = 0;
  for (const alloc of allocations) {
    const usage = await scheduler.getNodeGpuUsage(alloc.nodeId);
    totalUtil += usage.utilization;
  }
  
  return allocations.length > 0 ? totalUtil / allocations.length : 0;
}

export async function triggerManualScale(
  modelId: string, 
  replicas: number, 
  containerConfig: any
): Promise<void> {
  const autoscalingConfig = modelConfigs.get(modelId) || DEFAULT_AUTOSCALING_CONFIG;
  const clampedReplicas = Math.min(
    Math.max(replicas, autoscalingConfig.minReplicas), 
    autoscalingConfig.maxReplicas
  );
  
  await scalePool(modelId, clampedReplicas, containerConfig);
  lastScaleTime.set(modelId, Date.now());
  
  logger.info({ modelId, replicas: clampedReplicas }, 'Manual scale triggered');
}

export async function getAutoscalingMetrics(modelId: string): Promise<{
  currentReplicas: number;
  queueDepth: number;
  avgLatency: number;
  gpuUtilization: number;
  lastScaleTime: number | null;
  config: AutoscalingConfig;
}> {
  const [poolStatus, queueDepth, avgLatency, gpuUtil] = await Promise.all([
    getPoolStatus(modelId),
    getQueueDepth(modelId),
    getAverageLatency(modelId),
    getGpuUtilization(modelId)
  ]);

  return {
    currentReplicas: poolStatus.size,
    queueDepth,
    avgLatency,
    gpuUtilization: gpuUtil,
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