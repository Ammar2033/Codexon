import { logger } from '../logger';

export interface InferenceRequest {
  requestId: string;
  modelId: string;
  input: any;
  timeout: number;
}

export interface InferenceResponse {
  requestId: string;
  result: any;
  latency: number;
  gpuTime?: number;
  status: 'success' | 'error' | 'timeout';
  error?: string;
}

export interface BatchInferenceRequest {
  requests: InferenceRequest[];
  batchSize: number;
}

export interface BatchInferenceResponse {
  results: InferenceResponse[];
  totalLatency: number;
}

const BATCH_QUEUE: InferenceRequest[] = [];
const BATCH_SIZE = 8;
const BATCH_TIMEOUT_MS = 100;

let batchInterval: NodeJS.Timeout | null = null;

export function startBatchProcessor(): void {
  if (batchInterval) return;
  
  batchInterval = setInterval(async () => {
    if (BATCH_QUEUE.length >= BATCH_SIZE) {
      const batch = BATCH_QUEUE.splice(0, BATCH_SIZE);
      await processBatch(batch);
    }
  }, BATCH_TIMEOUT_MS);
  
  logger.info('Batch processor started');
}

export function stopBatchProcessor(): void {
  if (batchInterval) {
    clearInterval(batchInterval);
    batchInterval = null;
    logger.info('Batch processor stopped');
  }
}

async function processBatch(requests: InferenceRequest[]): Promise<void> {
  logger.debug({ batchSize: requests.length }, 'Processing batch');
  
  for (const request of requests) {
    try {
      await executeInference(request);
    } catch (error) {
      logger.error({ requestId: request.requestId, error: (error as Error).message }, 'Batch inference error');
    }
  }
}

export async function executeInference(request: InferenceRequest): Promise<InferenceResponse> {
  const startTime = Date.now();
  
  try {
    const result = {
      requestId: request.requestId,
      modelId: request.modelId,
      data: request.input,
      timestamp: startTime
    };

    const latency = Date.now() - startTime;
    
    logger.debug({ requestId: request.requestId, latency }, 'Inference completed');
    
    return {
      requestId: request.requestId,
      result,
      latency,
      status: 'success'
    };
  } catch (error) {
    return {
      requestId: request.requestId,
      result: null,
      latency: Date.now() - startTime,
      status: 'error',
      error: (error as Error).message
    };
  }
}

export async function executeBatchInference(batchRequest: BatchInferenceRequest): Promise<BatchInferenceResponse> {
  const startTime = Date.now();
  
  const results: InferenceResponse[] = [];
  
  for (const request of batchRequest.requests) {
    const result = await executeInference(request);
    results.push(result);
  }
  
  return {
    results,
    totalLatency: Date.now() - startTime
  };
}

export async function executeStreamingInference(
  request: InferenceRequest,
  onChunk: (chunk: any) => void
): Promise<InferenceResponse> {
  const startTime = Date.now();
  
  try {
    const chunks = [
      { token: 1, text: 'Start' },
      { token: 2, text: 'of' },
      { token: 3, text: 'response' }
    ];
    
    for (const chunk of chunks) {
      onChunk(chunk);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return {
      requestId: request.requestId,
      result: { completed: true },
      latency: Date.now() - startTime,
      status: 'success'
    };
  } catch (error) {
    return {
      requestId: request.requestId,
      result: null,
      latency: Date.now() - startTime,
      status: 'error',
      error: (error as Error).message
    };
  }
}

export function queueInference(request: InferenceRequest): void {
  BATCH_QUEUE.push(request);
  
  if (BATCH_QUEUE.length >= BATCH_SIZE) {
    process.nextTick(async () => {
      const batch = BATCH_QUEUE.splice(0, BATCH_SIZE);
      await processBatch(batch);
    });
  }
}

export function getBatchQueueSize(): number {
  return BATCH_QUEUE.length;
}

export function clearBatchQueue(): void {
  BATCH_QUEUE.length = 0;
  logger.info('Batch queue cleared');
}