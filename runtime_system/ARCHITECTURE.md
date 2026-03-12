# Codexon AI Model Runtime Architecture

## Overview

The Codexon Runtime is a production-grade inference system designed to handle thousands of concurrent AI model requests across multiple GPU nodes.

## Architecture Layers

```
Client
    ↓
API Gateway (NGINX)
    ↓
Node.js API Server
    ↓
Request Router
    ↓
┌─────────────────────────────────────────────┐
│            Queue System (Redis)             │
│  - Priority Queues per Model                │
│  - Job Scheduling                           │
│  - Rate Limiting                            │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│        Scheduler (GPU-Aware)                │
│  - Node Selection                           │
│  - Resource Allocation                      │
│  - Job Distribution                         │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│        Runtime Manager                      │
│  - Container Allocator                      │
│  - Job Dispatcher                           │
│  - Health Monitor                           │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│        Container Pool                       │
│  - Warm Container Pool                      │
│  - Container Recycling                      │
│  - Load Balancing                           │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│        GPU Worker Nodes                     │
│  - Model Loading                            │
│  - Batch Inference                          │
│  - Response Generation                      │
└─────────────────────────────────────────────┘
    ↓
Usage Events → Analytics Pipeline
```

## Components

### 1. Queue System (`queue_system/`)
- **Redis-based queues** per model
- Priority levels (high, normal, low)
- Job retry with exponential backoff
- Timeout handling

### 2. Scheduler (`scheduler/`)
- **GPU-aware scheduling** with best-fit algorithm
- Node health monitoring
- Load balancing across nodes
- Fractional GPU allocation

### 3. Runtime Manager (`runtime_manager/`)
- `container_allocator.py` - Container creation/destruction
- `container_monitor.py` - Health checks
- `job_dispatcher.py` - Job distribution

### 4. Container Pool (`container_pool/`)
- Pre-warmed container pools
- Container lifecycle management
- Request distribution across containers

### 5. GPU Worker (`gpu_worker/`)
- FastAPI inference server
- Model weight loading
- Batch inference support

### 6. Autoscaling Engine (`autoscaling/`)
- Queue depth monitoring
- Scale up/down triggers
- Cooldown management

### 7. Usage Metering (`usage_metering/`)
- Request tracking
- Latency measurement
- Cost calculation

### 8. Analytics Pipeline (`analytics/`)
- Event aggregation
- Revenue tracking
- Performance metrics

## Data Flow

### Inference Request Flow
1. Client sends POST to `/v1/models/{id}/inference`
2. API validates API key and rate limits
3. Request placed in `model_queue:{model_id}`
4. Scheduler picks job, selects node
5. Runtime Manager dispatches to container
6. GPU Worker runs inference
7. Response returned, usage event logged

### Job Structure
```json
{
  "job_id": "uuid",
  "model_id": "string",
  "user_id": "string",
  "input": {},
  "priority": "high|normal|low",
  "timestamp": "ISO8601",
  "timeout": 30000
}
```

## Scaling Policies

### Scale Up Triggers
- Queue depth > 10 for 30 seconds
- Average latency > 500ms
- GPU utilization > 80%

### Scale Down Triggers
- Queue depth = 0 for 5 minutes
- Container idle > 10 minutes

## Container Pool Strategy

### Warm Pool
- Maintain 2-3 ready containers per model
- Pre-load model weights
- Keep containers warm with periodic health checks

### Container Lifecycle
1. Create from Dockerfile
2. Load model weights
3. Mark as ready
4. Receive requests
5. Recycle after idle timeout
6. Destroy after max lifetime

## GPU Scheduling

### Node Selection Algorithm (Best-Fit)
1. Filter nodes with enough GPU memory
2. Sort by least loaded
3. Select node with best fit
4. Allocate fractional GPU if needed

### Fractional GPU Allocation
- Track GPU memory per node
- Allow multiple containers per GPU
- Prevent OOM errors

## Security

### Model Isolation
- Each model in isolated container
- No direct filesystem access
- Encrypted model storage

### Rate Limiting
- Per API key limits
- Per model limits
- Redis-based counter

## Monitoring

### Metrics
- Request latency (p50, p95, p99)
- Queue depth
- GPU utilization
- Container health
- Error rates

### Health Checks
- Node availability
- Container status
- Queue health
- GPU availability

## Cold Start Optimization

### Strategies
1. **Pre-warming**: Keep containers warm
2. **Model Caching**: Cache loaded models in memory
3. **Lazy Loading**: Load on first request
4. **Image Caching**: Pre-pull base images

## API Endpoints

### Inference
```
POST /v1/models/{model_id}/inference
Headers: Authorization: Bearer {api_key}
Body: { "input": { ... } }
```

### Batch Inference
```
POST /v1/models/{model_id}/batch
Body: { "inputs": [...] }
```

### Model Status
```
GET /v1/models/{model_id}/status
```