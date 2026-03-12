import Docker from 'dockerode';
import path from 'path';
import fs from 'fs';
import { logger } from '../logger';
import { scheduler, SchedulingDecision, JobRequest } from '../scheduler';

const docker = new Docker();

export interface ContainerConfig {
  modelId: string;
  modelVersion: string;
  storagePath: string;
  codexonConfig: any;
  port: number;
  gpuIds?: number[];
  cpuLimit?: number;
  memoryLimit?: string;
}

export interface ContainerInfo {
  containerId: string;
  modelId: string;
  nodeId: string;
  port: number;
  status: 'starting' | 'ready' | 'running' | 'busy' | 'idle' | 'stopped' | 'error';
  gpuIds: number[];
  createdAt: Date;
  lastRequestAt: Date;
  requestCount: number;
  avgLatency: number;
}

export interface ContainerMetrics {
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage: number;
  gpuMemoryUsage: number;
  requestCount: number;
  avgLatency: number;
}

const containers: Map<string, ContainerInfo> = new Map();

export async function allocateContainer(config: ContainerConfig): Promise<ContainerInfo> {
  logger.info({ modelId: config.modelId }, 'Allocating container');

  const job: JobRequest = {
    jobId: `alloc-${Date.now()}`,
    modelId: config.modelId,
    userId: 'system',
    priority: 'normal',
    requiredGpuMemory: parseGpuMemory(config.codexonConfig?.resources?.memory || '4g'),
    requiredCpu: config.codexonConfig?.resources?.cpu || 2,
    timeout: 60000
  };

  const decision = await scheduler.selectNode(job);
  
  if (!decision) {
    throw new Error('No available node for container allocation');
  }

  const containerName = `codexon-${config.modelId}-${Date.now()}`;
  
  try {
    const dockerfileContent = generateDockerfile(config.codexonConfig?.runtime);
    const dockerfilePath = path.join(config.storagePath, 'Dockerfile');
    fs.writeFileSync(dockerfilePath, dockerfileContent);

    const hostConfig: Docker.ContainerCreateOptions['HostConfig'] = {
      Memory: parseMemory(config.memoryLimit || config.codexonConfig?.resources?.memory || '4g'),
      NanoCpus: (config.cpuLimit || config.codexonConfig?.resources?.cpu || 2) * 1e9,
      PortBindings: {
        [`${config.port}/tcp`]: [{ HostPort: config.port.toString() }]
      },
      RestartPolicy: { Name: 'unless-stopped' },
      Resources: {
        DeviceRequests: config.gpuIds?.length ? [{
          Driver: 'nvidia',
          Count: config.gpuIds.length,
          DeviceIDs: config.gpuIds.map(String),
          Capabilities: [['gpu']]
        }] : undefined
      },
      Env: [
        `PORT=${config.port}`,
        `MODEL_ID=${config.modelId}`,
        `MODEL_VERSION=${config.modelVersion}`
      ]
    };

    const container = await docker.createContainer({
      Image: getBaseImage(config.codexonConfig?.runtime?.framework),
      name: containerName,
      ExposedPorts: { [`${config.port}/tcp`]: {} },
      HostConfig: hostConfig,
      Labels: {
        'codexon.model': config.modelId,
        'codexon.node': decision.nodeId
      }
    });

    await container.start();

    const info: ContainerInfo = {
      containerId: container.id,
      modelId: config.modelId,
      nodeId: decision.nodeId,
      port: config.port,
      status: 'starting',
      gpuIds: config.gpuIds || [],
      createdAt: new Date(),
      lastRequestAt: new Date(),
      requestCount: 0,
      avgLatency: 0
    };

    containers.set(config.modelId, info);

    setTimeout(async () => {
      const c = containers.get(config.modelId);
      if (c) {
        c.status = 'ready';
        logger.info({ modelId: config.modelId, containerId: c.containerId }, 'Container ready');
      }
    }, 5000);

    return info;
  } catch (error) {
    await scheduler.releaseGpus(config.modelId);
    throw error;
  }
}

export async function destroyContainer(modelId: string): Promise<void> {
  const info = containers.get(modelId);
  if (!info) return;

  try {
    const container = docker.getContainer(info.containerId);
    await container.stop({ t: 10 });
    await container.remove({ force: true });
  } catch (error) {
    logger.warn({ modelId, error: (error as Error).message }, 'Error destroying container');
  }

  await scheduler.releaseGpus(modelId);
  containers.delete(modelId);
  
  logger.info({ modelId }, 'Container destroyed');
}

export async function getContainerInfo(modelId: string): Promise<ContainerInfo | null> {
  return containers.get(modelId) || null;
}

export async function getContainerMetrics(modelId: string): Promise<ContainerMetrics | null> {
  const info = containers.get(modelId);
  if (!info) return null;

  try {
    const container = docker.getContainer(info.containerId);
    const stats = await container.stats({ stream: false });

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

    return {
      cpuUsage: cpuPercent,
      memoryUsage: stats.memory_stats.usage || 0,
      gpuUsage: 0,
      gpuMemoryUsage: 0,
      requestCount: info.requestCount,
      avgLatency: info.avgLatency
    };
  } catch (error) {
    return null;
  }
}

export async function updateContainerStatus(modelId: string, status: ContainerInfo['status']): Promise<void> {
  const info = containers.get(modelId);
  if (info) {
    info.status = status;
  }
}

export async function recordRequest(modelId: string, latency: number): Promise<void> {
  const info = containers.get(modelId);
  if (info) {
    info.lastRequestAt = new Date();
    info.requestCount++;
    info.avgLatency = (info.avgLatency * (info.requestCount - 1) + latency) / info.requestCount;
    info.status = 'busy';
    
    setTimeout(() => {
      const c = containers.get(modelId);
      if (c) c.status = 'ready';
    }, 1000);
  }
}

export function getAllContainers(): ContainerInfo[] {
  return Array.from(containers.values());
}

export async function healthCheckAll(): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  
  for (const [modelId, info] of containers) {
    try {
      const container = docker.getContainer(info.containerId);
      const inspection = await container.inspect();
      results.set(modelId, inspection.State.Running);
    } catch (error) {
      results.set(modelId, false);
    }
  }
  
  return results;
}

function generateDockerfile(runtime: any): string {
  const pythonVersion = runtime?.python || '3.12';
  const framework = runtime?.framework || 'onnx';
  
  let additionalDeps = '';
  if (framework === 'pytorch') {
    additionalDeps = 'RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu\n';
  } else if (framework === 'tensorflow') {
    additionalDeps = 'RUN pip install tensorflow\n';
  }

  return `FROM python:${pythonVersion}-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
${additionalDeps}
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
`;
}

function getBaseImage(framework?: string): string {
  switch (framework) {
    case 'pytorch': return 'pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime';
    case 'tensorflow': return 'tensorflow/tensorflow:2.13.0-gpu';
    default: return 'python:3.12-slim';
  }
}

function parseMemory(mem: string): number {
  const match = mem.match(/^(\d+)([gm]?)$/i);
  if (!match) return 4 * 1024 * 1024 * 1024;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'g') return value * 1024 * 1024 * 1024;
  if (unit === 'm') return value * 1024 * 1024;
  return value;
}

function parseGpuMemory(mem: string): number {
  return parseMemory(mem);
}