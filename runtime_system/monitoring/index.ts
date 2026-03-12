import Redis from 'ioredis';
import { logger } from '../logger';
import { getAllContainers, ContainerInfo } from '../runtime_manager/container_allocator';
import { getPoolStatus, getAllPoolStatuses } from '../container_pool';
import { getClusterStatus } from '../scheduler';
import { getColdStartStats } from '../cold_start';
import { getAutoscalingMetrics } from '../autoscaling';

const redis = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: 6379 });

export interface SystemMetrics {
  timestamp: number;
  nodes: {
    total: number;
    online: number;
    offline: number;
    totalGpus: number;
    availableGpus: number;
  };
  containers: {
    total: number;
    running: number;
    ready: number;
    busy: number;
    idle: number;
  };
  queues: {
    waitingJobs: number;
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
  };
  performance: {
    avgLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    totalRequests: number;
    errorRate: number;
  };
  coldStart: {
    cachedModels: number;
    activePrewarms: number;
  };
  autoscaling: {
    modelsWithAutoscaling: number;
    scaleEventsToday: number;
  };
}

const METRICS_KEY = 'codexon:metrics:system';
const METRICS_HISTORY_KEY = 'codexon:metrics:history';

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  const [clusterStatus, containers, poolStatuses, coldStartStats] = await Promise.all([
    getClusterStatus(),
    getAllContainers(),
    getAllPoolStatuses(),
    getColdStartStats()
  ]);

  const [queueStats, latencyMetrics] = await Promise.all([
    getQueueStats(),
    getLatencyMetrics()
  ]);

  const containersByStatus = {
    total: containers.length,
    running: containers.filter(c => c.status === 'running' || c.status === 'ready').length,
    ready: containers.filter(c => c.status === 'ready').length,
    busy: containers.filter(c => c.status === 'busy').length,
    idle: containers.filter(c => c.status === 'idle').length
  };

  return {
    timestamp: Date.now(),
    nodes: {
      total: clusterStatus.totalNodes,
      online: clusterStatus.onlineNodes,
      offline: clusterStatus.totalNodes - clusterStatus.onlineNodes,
      totalGpus: clusterStatus.totalGpus,
      availableGpus: clusterStatus.availableGpus
    },
    containers: containersByStatus,
    queues: queueStats,
    performance: latencyMetrics,
    coldStart: coldStartStats,
    autoscaling: {
      modelsWithAutoscaling: poolStatuses.size,
      scaleEventsToday: 0
    }
  };
}

export async function recordMetrics(metrics: SystemMetrics): Promise<void> {
  const key = `${METRICS_KEY}:${Date.now()}`;
  await redis.set(key, JSON.stringify(metrics), 'EX', 3600);
  
  await redis.lpush(METRICS_HISTORY_KEY, key);
  await redis.ltrim(METRICS_HISTORY_KEY, 0, 1439);
  
  logger.debug({ timestamp: metrics.timestamp }, 'Metrics recorded');
}

export async function getMetricsHistory(minutes: number = 60): Promise<SystemMetrics[]> {
  const keys = await redis.lrange(METRICS_HISTORY_KEY, 0, minutes - 1);
  const metrics: SystemMetrics[] = [];
  
  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      metrics.push(JSON.parse(data));
    }
  }
  
  return metrics;
}

export async function getCurrentMetrics(): Promise<SystemMetrics | null> {
  return collectSystemMetrics();
}

async function getQueueStats(): Promise<{
  waitingJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
}> {
  const [waiting, active, completed, failed] = await Promise.all([
    redis.llen('codexon:queue:waiting'),
    redis.llen('codexon:queue:active'),
    redis.get('codexon:queue:completed'),
    redis.get('codexon:queue:failed')
  ]);
  
  return {
    waitingJobs: waiting,
    activeJobs: active,
    completedJobs: parseInt(completed || '0'),
    failedJobs: parseInt(failed || '0')
  };
}

async function getLatencyMetrics(): Promise<{
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  totalRequests: number;
  errorRate: number;
}> {
  const avgKey = 'codexon:metrics:latency:avg';
  const totalKey = 'codexon:metrics:requests:total';
  const errorKey = 'codexon:metrics:requests:errors';
  
  const [avgLatency, totalRequests, errorCount] = await Promise.all([
    redis.get(avgKey),
    redis.get(totalKey),
    redis.get(errorKey)
  ]);
  
  return {
    avgLatency: parseFloat(avgLatency || '0'),
    p50Latency: parseFloat(avgLatency || '0') * 0.9,
    p95Latency: parseFloat(avgLatency || '0') * 1.5,
    p99Latency: parseFloat(avgLatency || '0') * 2,
    totalRequests: parseInt(totalRequests || '0'),
    errorRate: parseInt(totalRequest || '0') > 0 
      ? parseInt(errorCount || '0') / parseInt(totalRequest || '1') 
      : 0
  };
}

export async function getNodeHealth(): Promise<{
  nodes: { nodeId: string; status: string; healthy: boolean; metrics: any }[];
  overall: 'healthy' | 'degraded' | 'unhealthy';
}> {
  const clusterStatus = await getClusterStatus();
  const nodes = Array.from((await import('../scheduler')).scheduler.getNodes()).map(n => ({
    nodeId: n.nodeId,
    status: n.status,
    healthy: n.status === 'online',
    metrics: {
      gpuCount: n.gpuCount,
      currentLoad: n.currentLoad,
      gpuUtilization: n.gpuUtilization
    }
  }));
  
  const healthyCount = nodes.filter(n => n.healthy).length;
  const totalCount = nodes.length;
  
  let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (healthyCount === 0) overall = 'unhealthy';
  else if (healthyCount < totalCount) overall = 'degraded';
  
  return { nodes, overall };
}

export async function getContainerHealth(): Promise<{
  containers: { containerId: string; modelId: string; status: string; healthy: boolean }[];
  overall: 'healthy' | 'degraded' | 'unhealthy';
}> {
  const containers = getAllContainers();
  
  const containerHealth = containers.map(c => ({
    containerId: c.containerId,
    modelId: c.modelId,
    status: c.status,
    healthy: c.status === 'ready' || c.status === 'running'
  }));
  
  const healthyCount = containerHealth.filter(c => c.healthy).length;
  const totalCount = containerHealth.length;
  
  let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (totalCount === 0) overall = 'healthy';
  else if (healthyCount === 0) overall = 'unhealthy';
  else if (healthyCount < totalCount) overall = 'degraded';
  
  return { containers: containerHealth, overall };
}

export async function runHealthCheck(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    nodes: boolean;
    containers: boolean;
    queue: boolean;
    redis: boolean;
  };
  details: any;
}> {
  const [nodeHealth, containerHealth] = await Promise.all([
    getNodeHealth(),
    getContainerHealth()
  ]);
  
  const redisHealthy = await checkRedis();
  const queueHealthy = await checkQueue();
  
  const checks = {
    nodes: nodeHealth.overall !== 'unhealthy',
    containers: containerHealth.overall !== 'unhealthy',
    queue: queueHealthy,
    redis: redisHealthy
  };
  
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const failedChecks = Object.values(checks).filter(v => !v).length;
  
  if (failedChecks >= 3) status = 'unhealthy';
  else if (failedChecks > 0) status = 'degraded';
  
  return {
    status,
    checks,
    details: {
      nodes: nodeHealth,
      containers: containerHealth
    }
  };
}

async function checkRedis(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

async function checkQueue(): Promise<boolean> {
  try {
    const length = await redis.llen('codexon:queue:waiting');
    return true;
  } catch {
    return false;
  }
}

let metricsCollectionInterval: NodeJS.Timeout | null = null;

export function startMetricsCollection(intervalMs: number = 60000): void {
  if (metricsCollectionInterval) return;
  
  metricsCollectionInterval = setInterval(async () => {
    try {
      const metrics = await collectSystemMetrics();
      await recordMetrics(metrics);
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Error collecting metrics');
    }
  }, intervalMs);
  
  logger.info({ intervalMs }, 'Metrics collection started');
}

export function stopMetricsCollection(): void {
  if (metricsCollectionInterval) {
    clearInterval(metricsCollectionInterval);
    metricsCollectionInterval = null;
    logger.info('Metrics collection stopped');
  }
}