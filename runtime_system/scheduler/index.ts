import Redis from 'ioredis';
import { logger } from '../logger';

export interface NodeInfo {
  nodeId: string;
  hostname: string;
  gpuCount: number;
  gpuMemory: number;  // in bytes
  cpuCores: number;
  memory: number;     // in bytes
  status: 'online' | 'offline' | 'maintenance';
  lastHeartbeat: Date;
  currentLoad: number;
  gpuUtilization: number;
}

export interface SchedulingDecision {
  nodeId: string;
  containerId: string;
  gpuAllocated: number[];
  reason: string;
  score: number;
}

export interface JobRequest {
  jobId: string;
  modelId: string;
  userId: string;
  priority: 'high' | 'normal' | 'low';
  requiredGpuMemory: number;
  requiredCpu: number;
  timeout: number;
}

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const redis = new Redis({ host: REDIS_HOST, port: 6379 });

const NODES_KEY = 'codexon:nodes';
const NODE_METRICS_PREFIX = 'codexon:node_metrics:';
const GPU_ALLOCATIONS_KEY = 'codexon:gpu_allocations';

class Scheduler {
  private nodes: Map<string, NodeInfo> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startNodeMonitoring();
  }

  async registerNode(nodeInfo: NodeInfo): Promise<void> {
    this.nodes.set(nodeInfo.nodeId, nodeInfo);
    await redis.hset(NODES_KEY, nodeInfo.nodeId, JSON.stringify(nodeInfo));
    logger.info({ nodeId: nodeInfo.nodeId, gpuCount: nodeInfo.gpuCount }, 'Node registered');
  }

  async unregisterNode(nodeId: string): Promise<void> {
    this.nodes.delete(nodeId);
    await redis.hdel(NODES_KEY, nodeId);
    logger.info({ nodeId }, 'Node unregistered');
  }

  async updateNodeMetrics(nodeId: string, metrics: Partial<NodeInfo>): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    Object.assign(node, metrics, { lastHeartbeat: new Date() });
    await redis.hset(NODES_KEY, nodeId, JSON.stringify(node));
    await redis.set(
      `${NODE_METRICS_PREFIX}${nodeId}`,
      JSON.stringify({ ...node, timestamp: Date.now() }),
      'EX',
      300
    );
  }

  async selectNode(job: JobRequest): Promise<SchedulingDecision | null> {
    const availableNodes = Array.from(this.nodes.values())
      .filter(n => n.status === 'online')
      .filter(n => this.canFitJob(n, job));

    if (availableNodes.length === 0) {
      logger.warn({ jobId: job.jobId, modelId: job.modelId }, 'No suitable node found');
      return null;
    }

    const scoredNodes = availableNodes.map(node => ({
      node,
      score: this.calculateScore(node, job)
    }));

    scoredNodes.sort((a, b) => b.score - a.score);
    const best = scoredNodes[0];

    const gpuAllocation = this.allocateGpus(best.node, job.requiredGpuMemory);

    await this.reserveGpus(job.modelId, gpuAllocation);

    logger.info({
      jobId: job.jobId,
      nodeId: best.node.nodeId,
      gpus: gpuAllocation,
      score: best.score
    }, 'Node selected for job');

    return {
      nodeId: best.node.nodeId,
      containerId: `${job.modelId}-${Date.now()}`,
      gpuAllocated: gpuAllocation,
      reason: `Score: ${best.score.toFixed(2)}`,
      score: best.score
    };
  }

  private canFitJob(node: NodeInfo, job: JobRequest): boolean {
    const availableGpuMemory = node.gpuMemory * node.gpuCount - this.getAllocatedGpuMemory(node.nodeId);
    return availableGpuMemory >= job.requiredGpuMemory &&
           node.cpuCores >= job.requiredCpu;
  }

  private calculateScore(node: NodeInfo, job: JobRequest): number {
    const gpuScore = (node.gpuCount - this.getAllocatedGpuCount(node.nodeId)) / node.gpuCount;
    const loadScore = 1 - (node.currentLoad / 100);
    const gpuUtilScore = 1 - (node.gpuUtilization / 100);

    const priorityMultiplier = job.priority === 'high' ? 1.5 : job.priority === 'low' ? 0.8 : 1;

    return (gpuScore * 0.4 + loadScore * 0.3 + gpuUtilScore * 0.3) * priorityMultiplier;
  }

  private allocateGpus(node: NodeInfo, requiredMemory: number): number[] {
    const allocated = this.getNodeAllocations(node.nodeId);
    const gpus: number[] = [];

    for (let i = 0; i < node.gpuCount; i++) {
      if (!allocated.includes(i)) {
        gpus.push(i);
        if (gpus.length >= Math.ceil(requiredMemory / (node.gpuMemory))) break;
      }
    }

    return gpus;
  }

  private getAllocatedGpuCount(nodeId: string): number {
    return this.getNodeAllocations(nodeId).length;
  }

  private getAllocatedGpuMemory(nodeId: string): number {
    const allocations = this.getNodeAllocations(nodeId);
    const node = this.nodes.get(nodeId);
    return node ? allocations.length * node.gpuMemory : 0;
  }

  private getNodeAllocations(nodeId: string): number[] {
    return [];
  }

  private async reserveGpus(modelId: string, gpuIds: number[]): Promise<void> {
    const key = `${GPU_ALLOCATIONS_KEY}:${modelId}`;
    await redis.sadd(key, ...gpuIds.map(String));
    await redis.expire(key, 3600);
  }

  async releaseGpus(modelId: string): Promise<void> {
    const key = `${GPU_ALLOCATIONS_KEY}:${modelId}`;
    await redis.del(key);
  }

  getNodes(): NodeInfo[] {
    return Array.from(this.nodes.values());
  }

  async getNodeMetrics(nodeId: string): Promise<any> {
    const data = await redis.get(`${NODE_METRICS_PREFIX}${nodeId}`);
    return data ? JSON.parse(data) : null;
  }

  private startNodeMonitoring(): void {
    this.updateInterval = setInterval(async () => {
      const now = Date.now();
      for (const [nodeId, node] of this.nodes) {
        if (now - node.lastHeartbeat.getTime() > 60000) {
          node.status = 'offline';
          logger.warn({ nodeId }, 'Node heartbeat timeout');
        }
      }
    }, 30000);
  }

  shutdown(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

export const scheduler = new Scheduler();

export async function initializeCluster(nodes: NodeInfo[]): Promise<void> {
  for (const node of nodes) {
    await scheduler.registerNode(node);
  }
  logger.info({ nodeCount: nodes.length }, 'Cluster initialized');
}

export async function getClusterStatus(): Promise<{
  totalNodes: number;
  onlineNodes: number;
  totalGpus: number;
  availableGpus: number;
}> {
  const nodes = scheduler.getNodes();
  const onlineNodes = nodes.filter(n => n.status === 'online');
  const totalGpus = nodes.reduce((sum, n) => sum + n.gpuCount, 0);
  const availableGpus = onlineNodes.reduce((sum, n) => sum + n.gpuCount, 0);

  return { totalNodes: nodes.length, onlineNodes: onlineNodes.length, totalGpus, availableGpus };
}