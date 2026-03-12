import Redis from 'ioredis';
import { logger } from '../logger';

export interface NodeInfo {
  nodeId: string;
  hostname: string;
  gpuCount: number;
  gpuMemory: number;
  cpuCores: number;
  memory: number;
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
const GPU_NODE_MAPPING_KEY = 'codexon:gpu_node_mapping';

class Scheduler {
  private nodes: Map<string, NodeInfo> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

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
    await this.cleanupNodeAllocations(nodeId);
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

    const requiredGpus = Math.ceil(job.requiredGpuMemory / (best.node.gpuMemory || 16 * 1024 * 1024 * 1024));
    const gpuAllocation = this.allocateGpus(best.node, job.requiredGpuMemory);

    if (gpuAllocation.length === 0) {
      logger.warn({ jobId: job.jobId, nodeId: best.node.nodeId }, 'No GPUs available on selected node');
      return null;
    }

    await this.reserveGpus(job.modelId, best.node.nodeId, gpuAllocation);

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
      reason: `Score: ${best.score.toFixed(2)}, GPUs: ${gpuAllocation.length}`,
      score: best.score
    };
  }

  private canFitJob(node: NodeInfo, job: JobRequest): boolean {
    const availableGpuMemory = (node.gpuMemory || 16 * 1024 * 1024 * 1024) * node.gpuCount - await this.getAllocatedGpuMemory(node.nodeId);
    return availableGpuMemory >= job.requiredGpuMemory &&
           node.cpuCores >= job.requiredCpu;
  }

  private calculateScore(node: NodeInfo, job: JobRequest): number {
    const allocatedGpuCount = this.getAllocatedGpuCount(node.nodeId);
    const gpuScore = node.gpuCount > 0 
      ? (node.gpuCount - allocatedGpuCount) / node.gpuCount 
      : 1;
    const loadScore = 1 - (node.currentLoad / 100);
    const gpuUtilScore = 1 - (node.gpuUtilization / 100);

    const priorityMultiplier = job.priority === 'high' ? 1.5 : job.priority === 'low' ? 0.8 : 1;

    return (gpuScore * 0.4 + loadScore * 0.3 + gpuUtilScore * 0.3) * priorityMultiplier;
  }

  private allocateGpus(node: NodeInfo, requiredMemory: number): number[] {
    const allocated = this.getNodeAllocations(node.nodeId);
    const gpus: number[] = [];
    const gpuMemory = node.gpuMemory || 16 * 1024 * 1024 * 1024;
    const requiredGpus = Math.ceil(requiredMemory / gpuMemory);

    for (let i = 0; i < node.gpuCount; i++) {
      if (!allocated.includes(i)) {
        gpus.push(i);
        if (gpus.length >= requiredGpus) break;
      }
    }

    return gpus;
  }

  private getAllocatedGpuCount(nodeId: string): number {
    return this.getNodeAllocations(nodeId).length;
  }

  private async getAllocatedGpuMemory(nodeId: string): Promise<number> {
    const allocations = this.getNodeAllocations(nodeId);
    const node = this.nodes.get(nodeId);
    const gpuMemory = node?.gpuMemory || 16 * 1024 * 1024 * 1024;
    return allocations.length * gpuMemory;
  }

  private getNodeAllocations(nodeId: string): number[] {
    const key = `${GPU_ALLOCATIONS_KEY}:${nodeId}`;
    try {
      const data = redis.get(key);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private async reserveGpus(modelId: string, nodeId: string, gpuIds: number[]): Promise<void> {
    const allocationKey = `${GPU_ALLOCATIONS_KEY}:${nodeId}`;
    const mappingKey = `${GPU_NODE_MAPPING_KEY}:${modelId}`;
    
    const currentAllocations = await this.getNodeAllocations(nodeId);
    const updatedAllocations = [...new Set([...currentAllocations, ...gpuIds])];
    
    await redis.set(allocationKey, JSON.stringify(updatedAllocations));
    await redis.hset(mappingKey, nodeId, JSON.stringify(gpuIds));
    await redis.expire(allocationKey, 3600);
    await redis.expire(mappingKey, 3600);
  }

  private async cleanupNodeAllocations(nodeId: string): Promise<void> {
    const allocationKey = `${GPU_ALLOCATIONS_KEY}:${nodeId}`;
    await redis.del(allocationKey);
    
    const modelKeys = await redis.keys(`${GPU_NODE_MAPPING_KEY}:*`);
    for (const key of modelKeys) {
      await redis.hdel(key, nodeId);
    }
  }

  async releaseGpus(modelId: string): Promise<void> {
    const mappingKey = `${GPU_NODE_MAPPING_KEY}:${modelId}`;
    const nodeGpus = await redis.hgetall(mappingKey);
    
    for (const [nodeId, gpuIdsJson] of Object.entries(nodeGpus)) {
      const gpuIds = JSON.parse(gpuIdsJson);
      const allocationKey = `${GPU_ALLOCATIONS_KEY}:${nodeId}`;
      
      const currentAllocations = await this.getNodeAllocations(nodeId);
      const remainingAllocations = currentAllocations.filter(g => !gpuIds.includes(g));
      
      if (remainingAllocations.length === 0) {
        await redis.del(allocationKey);
      } else {
        await redis.set(allocationKey, JSON.stringify(remainingAllocations));
      }
    }
    
    await redis.del(mappingKey);
    logger.info({ modelId }, 'GPU allocations released');
  }

  getNodes(): NodeInfo[] {
    return Array.from(this.nodes.values());
  }

  async getNodeMetrics(nodeId: string): Promise<any> {
    const data = await redis.get(`${NODE_METRICS_PREFIX}${nodeId}`);
    return data ? JSON.parse(data) : null;
  }

  async getGpuAllocations(modelId: string): Promise<{ nodeId: string; gpuIds: number[] }[]> {
    const mappingKey = `${GPU_NODE_MAPPING_KEY}:${modelId}`;
    const nodeGpus = await redis.hgetall(mappingKey);
    
    return Object.entries(nodeGpus).map(([nodeId, gpuIdsJson]) => ({
      nodeId,
      gpuIds: JSON.parse(gpuIdsJson)
    }));
  }

  async getNodeGpuUsage(nodeId: string): Promise<{
    total: number;
    allocated: number;
    available: number;
    utilization: number;
  }> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return { total: 0, allocated: 0, available: 0, utilization: 0 };
    }

    const allocated = this.getAllocatedGpuCount(nodeId);
    const available = node.gpuCount - allocated;
    const utilization = node.gpuUtilization;

    return {
      total: node.gpuCount,
      allocated,
      available,
      utilization
    };
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

    this.healthCheckInterval = setInterval(async () => {
      for (const [nodeId, node] of this.nodes) {
        if (node.status === 'online') {
          try {
            const response = await fetch(`http://${node.hostname}:9090/health`, { 
              method: 'GET',
              signal: AbortSignal.timeout(5000)
            });
            if (!response.ok) {
              node.status = 'maintenance';
              logger.warn({ nodeId, status: response.status }, 'Node health check failed');
            }
          } catch {
            node.currentLoad = Math.min(node.currentLoad + 10, 100);
          }
        }
      }
    }, 60000);
  }

  shutdown(): void {
    if (this.updateInterval) clearInterval(this.updateInterval);
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
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
  const availableGpus = onlineNodes.reduce((sum, n) => {
    const allocated = scheduler.getAllocatedGpuCount(n.nodeId);
    return sum + (n.gpuCount - allocated);
  }, 0);

  return { totalNodes: nodes.length, onlineNodes: onlineNodes.length, totalGpus, availableGpus };
}