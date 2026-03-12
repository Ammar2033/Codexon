import { logger } from '../logger';
import { ContainerInfo, allocateContainer, destroyContainer, recordRequest, getAllContainers, updateContainerMetrics, ContainerConfig } from './runtime_manager';
import { getContainerByModel } from './runtime_manager';

export interface PoolConfig {
  minSize: number;
  maxSize: number;
  idleTimeout: number;
  maxLifetime: number;
  prewarmOnDeploy: boolean;
  loadBalancingStrategy: 'round_robin' | 'least_load' | 'random';
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  minSize: 1,
  maxSize: 5,
  idleTimeout: 600000,
  maxLifetime: 3600000,
  prewarmOnDeploy: true,
  loadBalancingStrategy: 'least_load'
};

interface PooledContainer {
  info: ContainerInfo;
  idleSince: Date;
  isWarming: boolean;
}

const containerPools: Map<string, PooledContainer[]> = new Map();
const poolConfigs: Map<string, PoolConfig> = new Map();
const healthCheckInterval: Map<string, NodeJS.Timeout> = new Map();
const metricsInterval: NodeJS.Timeout | null = null;

export function configurePool(modelId: string, config: Partial<PoolConfig>): void {
  poolConfigs.set(modelId, { ...DEFAULT_POOL_CONFIG, ...config });
  logger.info({ modelId, config }, 'Pool configured');
}

export async function initializePool(modelId: string, config: ContainerConfig): Promise<void> {
  const poolConfig = poolConfigs.get(modelId) || DEFAULT_POOL_CONFIG;
  
  if (!containerPools.has(modelId)) {
    containerPools.set(modelId, []);
  }

  if (poolConfig.prewarmOnDeploy) {
    await prewarmPool(modelId, config, poolConfig.minSize);
  }

  startPoolHealthCheck(modelId);
  startMetricsCollection();
  
  logger.info({ modelId, poolSize: poolConfig.minSize }, 'Container pool initialized');
}

async function prewarmPool(modelId: string, config: ContainerConfig, count: number): Promise<void> {
  const pool = containerPools.get(modelId) || [];
  
  for (let i = 0; i < count; i++) {
    try {
      const port = 9000 + Math.floor(Math.random() * 1000) + i;
      const info = await allocateContainer({ ...config, port });
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      pool.push({
        info,
        idleSince: new Date(),
        isWarming: false
      });
    } catch (error) {
      logger.error({ modelId, error: (error as Error).message }, 'Failed to prewarm container');
    }
  }
  
  containerPools.set(modelId, pool);
}

export async function acquireContainer(modelId: string, config: ContainerConfig): Promise<ContainerInfo> {
  let pool = containerPools.get(modelId);
  const poolConfig = poolConfigs.get(modelId) || DEFAULT_POOL_CONFIG;
  
  if (!pool || pool.length === 0) {
    const port = 9000 + Math.floor(Math.random() * 1000);
    const info = await allocateContainer({ ...config, port });
    
    pool = [{
      info,
      idleSince: new Date(),
      isWarming: false
    }];
    containerPools.set(modelId, pool);
    return info;
  }

  const available = pool.filter(c => !c.isWarming && c.info.status === 'ready');
  
  if (available.length === 0) {
    if (pool.length < poolConfig.maxSize) {
      const port = 9000 + Math.floor(Math.random() * 1000);
      const info = await allocateContainer({ ...config, port });
      
      pool.push({
        info,
        idleSince: new Date(),
        isWarming: true
      });
      
      setTimeout(() => {
        const p = containerPools.get(modelId);
        if (p) {
          const c = p.find(x => x.info.containerId === info.containerId);
          if (c) c.isWarming = false;
        }
      }, 5000);
      
      return info;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    return acquireContainer(modelId, config);
  }

  let selected: PooledContainer;
  
  switch (poolConfig.loadBalancingStrategy) {
    case 'round_robin':
      const readyContainers = pool.filter(c => c.info.status === 'ready' && !c.isWarming);
      const lastUsed = pool.findIndex(c => c.info.status === 'busy' || c.isWarming);
      const nextIndex = (readyContainers.indexOf(pool[lastUsed >= 0 ? lastUsed : 0]) + 1) % readyContainers.length;
      selected = readyContainers[nextIndex] || readyContainers[0];
      break;
      
    case 'least_load':
      selected = available
        .sort((a, b) => a.info.currentLoad - b.info.currentLoad)[0];
      break;
      
    case 'random':
    default:
      selected = available[Math.floor(Math.random() * available.length)];
      break;
  }

  selected.idleSince = new Date();
  selected.info.status = 'busy';
  
  return selected.info;
}

export async function releaseContainer(modelId: string, latency: number): Promise<void> {
  const pool = containerPools.get(modelId);
  if (!pool) return;

  const container = pool.find(c => c.info.status === 'busy');
  if (container) {
    await recordRequest(modelId, latency);
    container.idleSince = new Date();
    container.info.status = 'ready';
  }
}

async function cleanupIdleContainers(modelId: string): Promise<void> {
  const pool = containerPools.get(modelId);
  const poolConfig = poolConfigs.get(modelId) || DEFAULT_POOL_CONFIG;
  
  if (!pool || pool.length <= poolConfig.minSize) return;

  const now = Date.now();
  
  for (let i = pool.length - 1; i >= 0; i--) {
    const container = pool[i];
    const idleTime = now - container.idleSince.getTime();
    
    if (idleTime > poolConfig.idleTimeout && pool.length > poolConfig.minSize) {
      try {
        await destroyContainer(container.info.modelId);
        pool.splice(i, 1);
        logger.info({ modelId, containerId: container.info.containerId }, 'Idle container removed');
      } catch (error) {
        logger.error({ modelId, error: (error as Error).message }, 'Failed to remove idle container');
      }
    }
  }
  
  containerPools.set(modelId, pool);
}

export async function scalePool(modelId: string, targetSize: number, config: ContainerConfig): Promise<void> {
  const pool = containerPools.get(modelId);
  if (!pool) return;

  const poolConfig = poolConfigs.get(modelId) || DEFAULT_POOL_CONFIG;
  const clampedSize = Math.min(Math.max(targetSize, poolConfig.minSize), poolConfig.maxSize);
  
  const currentSize = pool.length;
  const diff = clampedSize - currentSize;

  if (diff > 0) {
    for (let i = 0; i < diff; i++) {
      try {
        const port = 9000 + Math.floor(Math.random() * 2000) + i;
        const info = await allocateContainer({ ...config, port });
        pool.push({ info, idleSince: new Date(), isWarming: true });
        
        setTimeout(() => {
          const p = containerPools.get(modelId);
          if (p) {
            const c = p.find(x => x.info.containerId === info.containerId);
            if (c) c.isWarming = false;
          }
        }, 5000);
      } catch (error) {
        logger.error({ modelId, error: (error as Error).message }, 'Failed to scale up');
      }
    }
  } else if (diff < 0) {
    const toRemove = Math.abs(diff);
    for (let i = 0; i < toRemove && pool.length > poolConfig.minSize; i++) {
      const container = pool.pop();
      if (container) {
        await destroyContainer(container.info.modelId);
      }
    }
  }
  
  logger.info({ modelId, currentSize: pool.length, targetSize: clampedSize }, 'Pool scaled');
}

export function getPoolStatus(modelId: string): {
  size: number;
  busy: number;
  idle: number;
  warming: number;
  avgLoad: number;
} {
  const pool = containerPools.get(modelId) || [];
  
  return {
    size: pool.length,
    busy: pool.filter(c => c.info.status === 'busy').length,
    idle: pool.filter(c => c.info.status === 'ready').length,
    warming: pool.filter(c => c.isWarming).length,
    avgLoad: pool.length > 0 
      ? pool.reduce((sum, c) => sum + c.info.currentLoad, 0) / pool.length 
      : 0
  };
}

function startPoolHealthCheck(modelId: string): void {
  if (healthCheckInterval.has(modelId)) return;

  const interval = setInterval(async () => {
    await cleanupIdleContainers(modelId);
  }, 60000);

  healthCheckInterval.set(modelId, interval);
}

function startMetricsCollection(): void {
  if (metricsInterval) return;
  
  metricsInterval = setInterval(async () => {
    for (const [modelId, pool] of containerPools) {
      for (const container of pool) {
        try {
          await updateContainerMetrics(modelId);
        } catch (error) {
          logger.warn({ modelId, error: (error as Error).message }, 'Failed to update metrics');
        }
      }
    }
  }, 30000);
}

export function getAllPoolStatuses(): Map<string, ReturnType<typeof getPoolStatus>> {
  const statuses = new Map<string, ReturnType<typeof getPoolStatus>>();
  
  for (const modelId of containerPools.keys()) {
    statuses.set(modelId, getPoolStatus(modelId));
  }
  
  return statuses;
}

export async function destroyPool(modelId: string): Promise<void> {
  const interval = healthCheckInterval.get(modelId);
  if (interval) {
    clearInterval(interval);
    healthCheckInterval.delete(modelId);
  }

  const pool = containerPools.get(modelId) || [];
  for (const container of pool) {
    await destroyContainer(container.info.modelId);
  }
  
  containerPools.delete(modelId);
  poolConfigs.delete(modelId);
  
  logger.info({ modelId }, 'Pool destroyed');
}

export async function getPoolMetrics(modelId: string): Promise<{
  containers: ContainerInfo[];
  totalRequests: number;
  avgLatency: number;
  avgLoad: number;
}> {
  const pool = containerPools.get(modelId) || [];
  
  return {
    containers: pool.map(c => c.info),
    totalRequests: pool.reduce((sum, c) => sum + c.info.requestCount, 0),
    avgLatency: pool.length > 0 
      ? pool.reduce((sum, c) => sum + c.info.avgLatency, 0) / pool.length 
      : 0,
    avgLoad: pool.length > 0 
      ? pool.reduce((sum, c) => sum + c.info.currentLoad, 0) / pool.length 
      : 0
  };
}