import Docker from 'dockerode';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { logger } from './logger';

const docker = new Docker();

export interface ContainerConfig {
  modelId: string;
  modelVersion: string;
  storagePath: string;
  codexonConfig: CodexonConfig;
  port: number;
}

export interface CodexonConfig {
  model: {
    name: string;
    version: string;
    description: string;
  };
  runtime: {
    framework: string;
    python: string;
  };
  resources: {
    cpu: number;
    memory: string;
    gpu: number;
  };
  api: {
    endpoint: string;
  };
  billing: {
    price_per_request: number;
  };
}

export interface ContainerInfo {
  containerId: string;
  modelId: string;
  port: number;
  status: 'running' | 'stopped' | 'error';
  createdAt: Date;
}

const runningContainers: Map<string, ContainerInfo> = new Map();

export async function buildAndStartContainer(config: ContainerConfig): Promise<ContainerInfo> {
  const { modelId, modelVersion, storagePath, codexonConfig, port } = config;
  const containerName = `codexon-model-${modelId}-${modelVersion}`;

  logger.info({ modelId, modelVersion, port }, 'Building Docker container');

  try {
    const dockerfileContent = generateDockerfile(codexonConfig.runtime);
    const dockerfilePath = path.join(storagePath, 'Dockerfile');
    fs.writeFileSync(dockerfilePath, dockerfileContent);

    const tarPath = path.join(storagePath, 'model.tar');
    await createTarArchive(storagePath, tarPath);

    logger.info({ modelId }, 'Pushing image to Docker daemon');
    
    await new Promise<void>((resolve, reject) => {
      docker.buildImage(tarPath, { t: containerName, dockerfile: 'Dockerfile' }, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
          return;
        }
        
        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    const memoryLimit = codexonConfig.resources.memory || '4g';
    const cpuLimit = codexonConfig.resources.cpu || 2;
    const gpuCount = codexonConfig.resources.gpu || 0;

    const hostConfig: Docker.ContainerCreateOptions['HostConfig'] = {
      Memory: parseMemory(memoryLimit),
      NanoCpus: cpuLimit * 1e9,
      PortBindings: {
        [`${port}/tcp`]: [{ HostPort: port.toString() }]
      },
      RestartPolicy: { Name: 'unless-stopped' }
    };

    if (gpuCount > 0) {
      hostConfig.DeviceRequests = [{
        Driver: 'nvidia',
        Count: gpuCount,
        Capabilities: [['gpu']]
      }];
    }

    logger.info({ containerName, port }, 'Starting container');
    
    const container = await docker.createContainer({
      Image: containerName,
      name: containerName,
      ExposedPorts: { [`${port}/tcp`]: {} },
      HostConfig: hostConfig,
      Env: [
        `PORT=${port}`,
        `MODEL_ID=${modelId}`,
        `MODEL_VERSION=${modelVersion}`
      ]
    });

    await container.start();

    const info: ContainerInfo = {
      containerId: container.id,
      modelId,
      port,
      status: 'running',
      createdAt: new Date()
    };

    runningContainers.set(modelId, info);

    logger.info({ containerId: container.id, modelId, port }, 'Container started successfully');

    return info;
  } catch (error) {
    logger.error({ modelId, error: (error as Error).message }, 'Failed to build/start container');
    throw error;
  }
}

export async function stopContainer(modelId: string): Promise<void> {
  const info = runningContainers.get(modelId);
  if (!info) {
    throw new Error(`No running container for model ${modelId}`);
  }

  try {
    const container = docker.getContainer(info.containerId);
    await container.stop();
    
    info.status = 'stopped';
    logger.info({ modelId, containerId: info.containerId }, 'Container stopped');
  } catch (error) {
    logger.error({ modelId, error: (error as Error).message }, 'Failed to stop container');
    throw error;
  }
}

export async function removeContainer(modelId: string): Promise<void> {
  const info = runningContainers.get(modelId);
  if (!info) {
    throw new Error(`No container for model ${modelId}`);
  }

  try {
    const container = docker.getContainer(info.containerId);
    await container.remove({ force: true });
    
    const imageName = `codexon-model-${modelId}-${info.port}`;
    try {
      await docker.getImage(imageName).remove();
    } catch (e) {}

    runningContainers.delete(modelId);
    
    logger.info({ modelId, containerId: info.containerId }, 'Container removed');
  } catch (error) {
    logger.error({ modelId, error: (error as Error).message }, 'Failed to remove container');
    throw error;
  }
}

export async function restartContainer(modelId: string): Promise<void> {
  const info = runningContainers.get(modelId);
  if (!info) {
    throw new Error(`No container for model ${modelId}`);
  }

  try {
    const container = docker.getContainer(info.containerId);
    await container.restart();
    info.status = 'running';
    
    logger.info({ modelId, containerId: info.containerId }, 'Container restarted');
  } catch (error) {
    logger.error({ modelId, error: (error as Error).message }, 'Failed to restart container');
    throw error;
  }
}

export async function getContainerStatus(modelId: string): Promise<ContainerInfo | null> {
  const info = runningContainers.get(modelId);
  if (!info) return null;

  try {
    const container = docker.getContainer(info.containerId);
    const inspection = await container.inspect();
    
    if (inspection.State.Running) {
      info.status = 'running';
    } else {
      info.status = 'stopped';
    }
    
    return info;
  } catch (error) {
    return { ...info, status: 'error' };
  }
}

export async function getContainerLogs(modelId: string, tail: number = 100): Promise<string> {
  const info = runningContainers.get(modelId);
  if (!info) {
    throw new Error(`No container for model ${modelId}`);
  }

  try {
    const container = docker.getContainer(info.containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true
    });
    
    return logs.toString('utf-8');
  } catch (error) {
    logger.error({ modelId, error: (error as Error).message }, 'Failed to get container logs');
    throw error;
  }
}

export async function runInference(modelId: string, input: any): Promise<any> {
  const info = runningContainers.get(modelId);
  if (!info || info.status !== 'running') {
    throw new Error(`Model ${modelId} is not running`);
  }

  const baseUrl = process.env.MODEL_RUNTIME_BASE_URL || 'http://localhost';
  const url = `${baseUrl}:${info.port}/predict`;

  logger.info({ modelId, url }, 'Calling model inference');

  try {
    const response = await axios.post(url, { input }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });
    return response.data;
  } catch (error) {
    logger.error({ modelId, error: (error as Error).message }, 'Inference request failed');
    throw error;
  }
}

function generateDockerfile(runtime: CodexonConfig['runtime']): string {
  const pythonVersion = runtime.python || '3.12';
  const framework = runtime.framework || 'onnx';
  
  let baseImage = `python:${pythonVersion}-slim`;
  let additionalDeps = '';
  
  if (framework === 'pytorch') {
    additionalDeps = `
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
`;
  } else if (framework === 'tensorflow') {
    additionalDeps = `
RUN pip install tensorflow
`;
  }

  return `FROM ${baseImage}
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
`;
}

async function createTarArchive(sourceDir: string, outputPath: string): Promise<void> {
  const archiver = await import('archiver');
  const stream = fs.createWriteStream(outputPath);
  
  return new Promise((resolve, reject) => {
    const archive = archiver.default('tar', { gzip: true });
    
    archive.on('error', reject);
    archive.on('close', resolve);
    
    archive.directory(sourceDir, false);
    archive.pipe(stream);
    archive.finalize();
  });
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

export function getRunningContainers(): ContainerInfo[] {
  return Array.from(runningContainers.values());
}

export async function healthCheckAllContainers(): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  
  for (const [modelId, info] of runningContainers) {
    try {
      if (info.status === 'running') {
        const baseUrl = process.env.MODEL_RUNTIME_BASE_URL || 'http://localhost';
        await axios.get(`${baseUrl}:${info.port}/health`, { timeout: 5000 });
        results.set(modelId, true);
      } else {
        results.set(modelId, false);
      }
    } catch (error) {
      results.set(modelId, false);
    }
  }
  
  return results;
}