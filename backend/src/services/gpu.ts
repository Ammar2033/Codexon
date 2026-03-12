import { docker, ContainerConfig } from './docker';
import { logger } from './logger';

export interface GPUAllocation {
  modelId: string;
  gpuIds: number[];
  memory: number;
  allocatedAt: Date;
}

export interface GPUDeviceInfo {
  id: string;
  name: string;
  memory: number;
  available: boolean;
}

const allocatedGPUs: Map<string, GPUAllocation> = new Map();
const availableGPUIds: Set<number> = new Set([0, 1, 2, 3]);

export async function getGPUInfo(): Promise<GPUDeviceInfo[]> {
  try {
    const result = await docker.listContainers({ all: true });
    
    const gpuDevices: GPUDeviceInfo[] = [];
    
    for (const gpuId of Array.from({ length: 4 }, (_, i) => i)) {
      const isAllocated = Array.from(allocatedGPUs.values())
        .some(alloc => alloc.gpuIds.includes(gpuId));
      
      gpuDevices.push({
        id: `gpu-${gpuId}`,
        name: `NVIDIA GPU ${gpuId}`,
        memory: 16 * 1024 * 1024 * 1024,
        available: !isAllocated
      });
    }
    
    return gpuDevices;
  } catch (error) {
    logger.warn({ error: (error as Error).message }, 'Failed to get GPU info, returning defaults');
    
    return [
      { id: 'gpu-0', name: 'NVIDIA GPU 0', memory: 16 * 1024 * 1024 * 1024, available: true },
      { id: 'gpu-1', name: 'NVIDIA GPU 1', memory: 16 * 1024 * 1024 * 1024, available: true },
      { id: 'gpu-2', name: 'NVIDIA GPU 2', memory: 16 * 1024 * 1024 * 1024, available: true },
      { id: 'gpu-3', name: 'NVIDIA GPU 3', memory: 16 * 1024 * 1024 * 1024, available: true },
    ];
  }
}

export async function allocateGPU(modelId: string, requiredGpus: number = 1, requiredMemory: number = 8): Promise<number[]> {
  const allocated = allocatedGPUs.get(modelId);
  if (allocated) {
    return allocated.gpuIds;
  }

  const availableGPUs = Array.from(availableGPUIds).filter(id => {
    return !Array.from(allocatedGPUs.values()).some(a => a.gpuIds.includes(id));
  });

  if (availableGPUs.length < requiredGpus) {
    throw new Error(`Insufficient GPUs: requested ${requiredGpus}, available ${availableGPUs.length}`);
  }

  const selectedGPUs = availableGPUs.slice(0, requiredGpus);
  
  allocatedGPUs.set(modelId, {
    modelId,
    gpuIds: selectedGPUs,
    memory: requiredMemory * 1024 * 1024 * 1024,
    allocatedAt: new Date()
  });

  for (const gpuId of selectedGPUs) {
    availableGPUIds.delete(gpuId);
  }

  logger.info({ modelId, gpuIds: selectedGPUs }, 'GPU allocated');

  return selectedGPUs;
}

export async function releaseGPU(modelId: string): Promise<void> {
  const allocation = allocatedGPUs.get(modelId);
  
  if (!allocation) {
    return;
  }

  for (const gpuId of allocation.gpuIds) {
    availableGPUIds.add(gpuId);
  }

  allocatedGPUs.delete(modelId);

  logger.info({ modelId, gpuIds: allocation.gpuIds }, 'GPU released');
}

export function getGPUAllocations(): GPUAllocation[] {
  return Array.from(allocatedGPUs.values());
}

export async function getGPUMemoryUsage(): Promise<{ used: number; total: number }> {
  const totalGPUs = 4;
  const totalMemory = totalGPUs * 16 * 1024 * 1024 * 1024;
  
  let usedMemory = 0;
  for (const allocation of allocatedGPUs.values()) {
    usedMemory += allocation.memory;
  }

  return { used: usedMemory, total: totalMemory };
}

export async function createGPUEnabledContainer(config: ContainerConfig): Promise<void> {
  const requiredGpus = config.codexonConfig?.resources?.gpu || 0;
  
  if (requiredGpus > 0) {
    const requiredMemory = parseInt(config.codexonConfig.resources.memory) || 8;
    const gpuIds = await allocateGPU(config.modelId, requiredGpus, requiredMemory);
    
    config.codexonConfig.resources.gpu = gpuIds.length;
  }

  const { buildAndStartContainer } = await import('./docker');
  await buildAndStartContainer(config);
}

export async function handleGPUScheduling(): Promise<void> {
  const gpuUsage = await getGPUMemoryUsage();
  const utilizationPercent = (gpuUsage.used / gpuUsage.total) * 100;

  logger.info({ 
    used: gpuUsage.used, 
    total: gpuUsage.total, 
    utilization: utilizationPercent.toFixed(2) 
  }, 'GPU usage');

  if (utilizationPercent > 90) {
    logger.warn('GPU utilization high, consider scaling or queuing');
  }
}