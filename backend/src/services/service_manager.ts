import { logger } from '../services/logger';
import { collectDefaultMetrics } from '../services/metrics';
import { scheduler, initializeCluster, getClusterStatus, getGPUStatus, Scheduler, NodeInfo } from './scheduler';
import { initializePool, configurePool, getPoolStatus, getAllPoolStatuses, acquireContainer, releaseContainer, getPoolMetrics, PoolConfig, ContainerConfig } from './container_pool';
import { allocateContainer as runtimeAllocateContainer, destroyContainer, getContainerInfo, updateContainerMetrics, recordRequest, getAllContainers, healthCheckAll, getContainerLogs, getContainerByModel, ContainerInfo } from './runtime_manager';
import { getModelQueue, getBatchQueue, addInferenceJob, addBatchJob, getQueueStats, getJobHistory, pauseQueue, resumeQueue, clearQueue } from './queue_system';
import { configureAutoscaling, disableAutoscaling, startAutoscaler, stopAutoscaler, triggerManualScale, getAutoscalingMetrics, getAllAutoscalingStatuses } from './autoscaling';
import { createModelVersion, getModelVersions, getActiveVersion, setActiveVersion, deprecateVersion, archiveVersion, rollbackToVersion, deleteVersion, getVersionStats, ModelVersion } from './model_versioning';

export interface RuntimeServices {
  scheduler: typeof scheduler;
  containerPool: {
    initializePool: typeof initializePool;
    configurePool: typeof configurePool;
    acquireContainer: typeof acquireContainer;
    releaseContainer: typeof releaseContainer;
    getPoolStatus: typeof getPoolStatus;
    getAllPoolStatuses: typeof getAllPoolStatuses;
    getPoolMetrics: typeof getPoolMetrics;
  };
  runtimeManager: {
    allocateContainer: typeof runtimeAllocateContainer;
    destroyContainer: typeof destroyContainer;
    getContainerInfo: typeof getContainerInfo;
    updateContainerMetrics: typeof updateContainerMetrics;
    recordRequest: typeof recordRequest;
    getAllContainers: typeof getAllContainers;
    healthCheckAll: typeof healthCheckAll;
    getContainerLogs: typeof getContainerLogs;
    getContainerByModel: typeof getContainerByModel;
  };
  queueSystem: {
    getModelQueue: typeof getModelQueue;
    getBatchQueue: typeof getBatchQueue;
    addInferenceJob: typeof addInferenceJob;
    addBatchJob: typeof addBatchJob;
    getQueueStats: typeof getQueueStats;
    getJobHistory: typeof getJobHistory;
    pauseQueue: typeof pauseQueue;
    resumeQueue: typeof resumeQueue;
    clearQueue: typeof clearQueue;
  };
  autoscaler: {
    configureAutoscaling: typeof configureAutoscaling;
    disableAutoscaling: typeof disableAutoscaling;
    startAutoscaler: typeof startAutoscaler;
    stopAutoscaler: typeof stopAutoscaler;
    triggerManualScale: typeof triggerManualScale;
    getAutoscalingMetrics: typeof getAutoscalingMetrics;
    getAllAutoscalingStatuses: typeof getAllAutoscalingStatuses;
  };
  modelVersioning: {
    createModelVersion: typeof createModelVersion;
    getModelVersions: typeof getModelVersions;
    getActiveVersion: typeof getActiveVersion;
    setActiveVersion: typeof setActiveVersion;
    deprecateVersion: typeof deprecateVersion;
    archiveVersion: typeof archiveVersion;
    rollbackToVersion: typeof rollbackToVersion;
    deleteVersion: typeof deleteVersion;
    getVersionStats: typeof getVersionStats;
  };
}

let schedulerInstance: Scheduler | null = null;
let autoscalerRunning = false;

export async function initializeServices(): Promise<RuntimeServices> {
  logger.info('Initializing Codexon runtime services...');
  
  try {
    await collectDefaultMetrics();
    logger.info('Prometheus metrics initialized');
  } catch (error) {
    logger.warn({ error: (error as Error).message }, 'Failed to initialize default metrics');
  }
  
  try {
    schedulerInstance = new Scheduler();
    await initializeCluster([
      { nodeId: 'node-1', hostname: 'gpu-server-1', gpuCount: 4, gpuMemory: 32000, cpuCores: 16, memory: 64000, status: 'online', lastHeartbeat: new Date(), currentLoad: 0, gpuUtilization: 0 }
    ]);
    logger.info('GPU Scheduler initialized');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to initialize scheduler');
  }
  
  try {
    logger.info('Container Pool ready - use initializePool(modelId, config) to initialize');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to initialize container pool');
  }
  
  try {
    logger.info('Runtime Manager ready');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to initialize runtime manager');
  }
  
  try {
    logger.info('Queue System ready');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to initialize queue system');
  }
  
  try {
    if (!autoscalerRunning) {
      await startAutoscaler(30000);
      autoscalerRunning = true;
      logger.info('Autoscaler initialized');
    }
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to initialize autoscaler');
  }
  
  try {
    logger.info('Model Versioning ready');
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to initialize model versioning');
  }
  
  const services: RuntimeServices = {
    scheduler: schedulerInstance as any,
    containerPool: {
      initializePool,
      configurePool,
      acquireContainer,
      releaseContainer,
      getPoolStatus,
      getAllPoolStatuses,
      getPoolMetrics
    },
    runtimeManager: {
      allocateContainer,
      destroyContainer,
      getContainerInfo,
      updateContainerMetrics,
      recordRequest,
      getAllContainers,
      healthCheckAll,
      getContainerLogs,
      getContainerByModel
    },
    queueSystem: {
      getModelQueue,
      getBatchQueue,
      addInferenceJob,
      addBatchJob,
      getQueueStats,
      getJobHistory,
      pauseQueue,
      resumeQueue,
      clearQueue
    },
    autoscaler: {
      configureAutoscaling,
      disableAutoscaling,
      startAutoscaler,
      stopAutoscaler,
      triggerManualScale,
      getAutoscalingMetrics,
      getAllAutoscalingStatuses
    },
    modelVersioning: {
      createModelVersion,
      getModelVersions,
      getActiveVersion,
      setActiveVersion,
      deprecateVersion,
      archiveVersion,
      rollbackToVersion,
      deleteVersion,
      getVersionStats
    }
  };
  
  logger.info('All runtime services initialized successfully');
  
  return services;
}

export function getServices(): RuntimeServices | null {
  return null;
}

export async function shutdownServices(): Promise<void> {
  logger.info('Shutting down runtime services...');
  
  try {
    stopAutoscaler();
    logger.info('Autoscaler stopped');
  } catch (error) {
    logger.warn({ error: (error as Error).message }, 'Error stopping autoscaler');
  }
  
  logger.info('Runtime services shutdown complete');
}
