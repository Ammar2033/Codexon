import { Registry, Counter, Gauge, Histogram, Summary } from 'prom-client';

export const register = new Registry();

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register]
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const inferenceRequestsTotal = new Counter({
  name: 'codexon_inference_requests_total',
  help: 'Total number of inference requests',
  labelNames: ['model_id', 'status'],
  registers: [register]
});

export const inferenceDuration = new Histogram({
  name: 'codexon_inference_duration_seconds',
  help: 'Duration of inference requests in seconds',
  labelNames: ['model_id'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

export const batchInferenceSize = new Histogram({
  name: 'codexon_batch_inference_size',
  help: 'Size of batch inference requests',
  labelNames: ['model_id'],
  buckets: [1, 2, 4, 8, 16, 32, 64, 128],
  registers: [register]
});

export const activeContainers = new Gauge({
  name: 'codexon_active_containers',
  help: 'Number of active model containers',
  labelNames: ['model_id', 'node'],
  registers: [register]
});

export const containerPoolSize = new Gauge({
  name: 'codexon_container_pool_size',
  help: 'Total container pool size',
  labelNames: ['status'],
  registers: [register]
});

export const gpuUtilization = new Gauge({
  name: 'codexon_gpu_utilization_percent',
  help: 'GPU utilization percentage',
  labelNames: ['node', 'gpu_index'],
  registers: [register]
});

export const gpuMemoryUsed = new Gauge({
  name: 'codexon_gpu_memory_used_mb',
  help: 'GPU memory used in MB',
  labelNames: ['node', 'gpu_index'],
  registers: [register]
});

export const gpuMemoryTotal = new Gauge({
  name: 'codexon_gpu_memory_total_mb',
  help: 'Total GPU memory in MB',
  labelNames: ['node', 'gpu_index'],
  registers: [register]
});

export const cpuUtilization = new Gauge({
  name: 'codexon_cpu_utilization_percent',
  help: 'CPU utilization percentage',
  labelNames: ['node'],
  registers: [register]
});

export const memoryUtilization = new Gauge({
  name: 'codexon_memory_utilization_percent',
  help: 'Memory utilization percentage',
  labelNames: ['node'],
  registers: [register]
});

export const queueDepth = new Gauge({
  name: 'codexon_queue_depth',
  help: 'Number of pending jobs in queue',
  labelNames: ['model_id', 'queue_type'],
  registers: [register]
});

export const queueWaitingTime = new Histogram({
  name: 'codexon_queue_waiting_seconds',
  help: 'Time jobs spend waiting in queue',
  labelNames: ['model_id'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
  registers: [register]
});

export const autoscalerActionsTotal = new Counter({
  name: 'codexon_autoscaler_actions_total',
  help: 'Total number of autoscaler actions',
  labelNames: ['action', 'model_id'],
  registers: [register]
});

export const revenueTotal = new Gauge({
  name: 'codexon_revenue_total',
  help: 'Total revenue generated',
  registers: [register]
});

export const apiKeyUsage = new Counter({
  name: 'codexon_api_key_usage_total',
  help: 'Total API key usage',
  labelNames: ['api_key_id', 'model_id'],
  registers: [register]
});

export const rateLimitHits = new Counter({
  name: 'codexon_rate_limit_hits_total',
  help: 'Total rate limit hits',
  labelNames: ['api_key_id', 'endpoint'],
  registers: [register]
});

export const errorsTotal = new Counter({
  name: 'codexon_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'model_id'],
  registers: [register]
});

export const modelLatencyP50 = new Gauge({
  name: 'codexon_model_latency_p50_ms',
  help: 'P50 latency for model inference',
  labelNames: ['model_id'],
  registers: [register]
});

export const modelLatencyP95 = new Gauge({
  name: 'codexon_model_latency_p95_ms',
  help: 'P95 latency for model inference',
  labelNames: ['model_id'],
  registers: [register]
});

export const modelLatencyP99 = new Gauge({
  name: 'codexon_model_latency_p99_ms',
  help: 'P99 latency for model inference',
  labelNames: ['model_id'],
  registers: [register]
});

export const streamingTokens = new Counter({
  name: 'codexon_streaming_tokens_total',
  help: 'Total tokens streamed for LLM models',
  labelNames: ['model_id'],
  registers: [register]
});

export const requestsInProgress = new Gauge({
  name: 'codexon_requests_in_progress',
  help: 'Number of requests currently being processed',
  labelNames: ['model_id'],
  registers: [register]
});

export function getMetrics() {
  return register.metrics();
}

export function getContentType(): string {
  return register.contentType;
}

export async function collectDefaultMetrics() {
  const { collectDefaultMetrics } = await import('prom-client');
  collectDefaultMetrics({ register });
}
