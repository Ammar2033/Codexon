import { logger } from '../logger';
import { acquireContainer, ContainerInfo, getContainerInfo, getAllContainers } from '../container_pool';
import { startPoolHealthCheck, configurePool, PoolConfig } from '../container_pool';

export interface ColdStartConfig {
  prewarmEnabled: boolean;
  warmPoolSize: number;
  idleTimeout: number;
  modelCachingEnabled: boolean;
  lazyLoadingEnabled: boolean;
}

const DEFAULT_COLD_START_CONFIG: ColdStartConfig = {
  prewarmEnabled: true,
  warmPoolSize: 2,
  idleTimeout: 300000,
  modelCachingEnabled: true,
  lazyLoadingEnabled: true
};

const modelPreloadedModels: Map<string, any> = new Map();
const coldStartTimers: Map<string, NodeJS.Timeout> = new Map();

export interface ColdStartResult {
  modelId: string;
  containerReady: boolean;
  coldStartTime: number;
  fromCache: boolean;
  error?: string;
}

export async function initializeColdStartSystem(modelId: string, config: any): Promise<void> {
  const coldStartConfig = DEFAULT_COLD_START_CONFIG;
  
  configurePool(modelId, {
    minSize: coldStartConfig.warmPoolSize,
    maxSize: 5,
    idleTimeout: coldStartConfig.idleTimeout,
    prewarmOnDeploy: coldStartConfig.prewarmEnabled
  } as PoolConfig);

  logger.info({ modelId, warmPoolSize: coldStartConfig.warmPoolSize }, 'Cold start system initialized');
}

export async function getOrCreateContainer(modelId: string, config: any): Promise<ColdStartResult> {
  const startTime = Date.now();
  
  try {
    const container = await acquireContainer(modelId, {
      ...config,
      port: 9000 + Math.floor(Math.random() * 1000)
    });

    const coldStartTime = Date.now() - startTime;
    const fromCache = modelPreloadedModels.has(modelId);

    if (fromCache && coldStartTime < 1000) {
      logger.info({ modelId, coldStartTime, fromCache }, 'Container warm hit');
    } else {
      logger.info({ modelId, coldStartTime, fromCache }, 'Container cold start');
    }

    return {
      modelId,
      containerReady: true,
      coldStartTime,
      fromCache
    };
  } catch (error) {
    return {
      modelId,
      containerReady: false,
      coldStartTime: Date.now() - startTime,
      fromCache: false,
      error: (error as Error).message
    };
  }
}

export async function prewarmContainer(modelId: string, config: any): Promise<void> {
  logger.info({ modelId }, 'Pre-warming container');
  
  try {
    const container = await acquireContainer(modelId, {
      ...config,
      port: 9000 + Math.floor(Math.random() * 1000)
    });
    
    logger.info({ modelId, containerId: container.containerId }, 'Container pre-warmed');
  } catch (error) {
    logger.error({ modelId, error: (error as Error).message }, 'Failed to pre-warm container');
  }
}

export function schedulePrewarm(modelId: string, config: any, delayMs: number = 60000): void {
  const existingTimer = coldStartTimers.get(modelId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(async () => {
    await prewarmContainer(modelId, config);
    coldStartTimers.delete(modelId);
  }, delayMs);

  coldStartTimers.set(modelId, timer);
  
  logger.info({ modelId, delayMs }, 'Prewarm scheduled');
}

export function cancelPrewarm(modelId: string): void {
  const timer = coldStartTimers.get(modelId);
  if (timer) {
    clearTimeout(timer);
    coldStartTimers.delete(modelId);
    logger.info({ modelId }, 'Prewarm cancelled');
  }
}

export async function cacheModel(modelId: string, modelData: any): Promise<void> {
  if (DEFAULT_COLD_START_CONFIG.modelCachingEnabled) {
    modelPreloadedModels.set(modelId, modelData);
    logger.info({ modelId }, 'Model cached in memory');
  }
}

export function getCachedModel(modelId: string): any | null {
  return modelPreloadedModels.get(modelId) || null;
}

export function isModelCached(modelId: string): boolean {
  return modelPreloadedModels.has(modelId);
}

export function getColdStartStats(): {
  cachedModels: number;
  activePrewarms: number;
  containerStats: {
    total: number;
    ready: number;
    busy: number;
    idle: number;
  };
} {
  const containers = getAllContainers();
  
  return {
    cachedModels: modelPreloadedModels.size,
    activePrewarms: coldStartTimers.size,
    containerStats: {
      total: containers.length,
      ready: containers.filter(c => c.status === 'ready').length,
      busy: containers.filter(c => c.status === 'busy').length,
      idle: containers.filter(c => c.status === 'idle').length
    }
  };
}

export async function optimizeMemory(): Promise<void> {
  const containers = getAllContainers();
  
  const memoryByModel: Map<string, number> = new Map();
  
  for (const container of containers) {
    const current = memoryByModel.get(container.modelId) || 0;
    memoryByModel.set(container.modelId, current + 1);
  }

  for (const [modelId, count] of memoryByModel) {
    if (count > 3 && !isModelCached(modelId)) {
      logger.info({ modelId, containerCount: count }, 'Consider reducing pool size for memory optimization');
    }
  }
}

export async function warmAllModels(models: { modelId: string; config: any }[]): Promise<void> {
  logger.info({ modelCount: models.length }, 'Warming all model pools');
  
  for (const { modelId, config } of models) {
    try {
      await initializeColdStartSystem(modelId, config);
    } catch (error) {
      logger.error({ modelId, error: (error as Error).message }, 'Failed to warm model');
    }
  }
  
  logger.info('All model pools warmed');
}

export function clearCache(modelId?: string): void {
  if (modelId) {
    modelPreloadedModels.delete(modelId);
    logger.info({ modelId }, 'Model cache cleared');
  } else {
    modelPreloadedModels.clear();
    logger.info('All model caches cleared');
  }
}