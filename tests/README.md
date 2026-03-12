# Codexon Runtime Test & Verification Guide

## Quick Start

### Prerequisites
- Node.js 18+
- Docker
- Redis
- PostgreSQL

### Setup
```bash
# Install dependencies
cd backend && npm install

# Run database migrations
psql -d codexon -f database/migrations.sql

# Start Redis
redis-server

# Start the backend
npm run dev
```

## Running Tests

### 1. Runtime Tests
```bash
cd tests
chmod +x runtime-tests.sh
./runtime-tests.sh
```

### 2. Security Tests
```bash
cd tests
chmod +x security-tests.sh
./security-tests.sh
```

### 3. Load Tests
```bash
cd tests
chmod +x load-test.sh
CONCURRENT=100 DURATION=30 ./load-test.sh
```

## API Endpoints

### Health & Monitoring
```bash
# Basic health check
curl http://localhost:4000/health

# Prometheus metrics
curl http://localhost:4000/metrics

# JSON metrics
curl http://localhost:4000/metrics/json
```

### Inference
```bash
# Single inference
curl -X POST http://localhost:4000/inference/model-123 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"input": {"data": [1, 2, 3]}}'

# Batch inference
curl -X POST http://localhost:4000/batch/model-123 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"inputs": [{"data": [1,2,3]}, {"data": [4,5,6]}]}'

# Streaming (for LLM/audio/video)
curl -N http://localhost:4000/streaming/model-123
```

### Queue Management
```bash
# Get queue stats for a model
curl http://localhost:4000/queue/model-123/stats
```

### Tracing
```bash
# Get trace by ID
curl http://localhost:4000/trace/TRACE_ID

# Test trace propagation
curl -H "x-trace-id: custom-trace-123" http://localhost:4000/health
```

## Testing Examples

### Test Inference Pipeline
```bash
# Create a trace ID
TRACE_ID="test-$(date +%s)"

# Submit inference request with trace
curl -X POST http://localhost:4000/inference/my-model \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-key" \
  -H "x-trace-id: $TRACE_ID" \
  -d '{"input": {"text": "Hello"}}'

# Check trace
sleep 2
curl http://localhost:4000/trace/$TRACE_ID
```

### Test Batch Processing
```bash
# Submit batch request
BATCH_RESPONSE=$(curl -s -X POST http://localhost:4000/batch/test-model \
  -H "Content-Type: application/json" \
  -d '{"inputs": [
    {"data": [1,2,3]},
    {"data": [4,5,6]},
    {"data": [7,8,9]},
    {"data": [10,11,12]}
  ]}')

echo "$BATCH_RESPONSE"
```

### Test Streaming
```bash
# SSE streaming
curl -N http://localhost:4000/streaming/llm-model \
  -H "Accept: text/event-stream"
```

## Verification Commands

### Check All Services
```bash
# Health with full status
curl -s http://localhost:4000/health | jq .

# Queue depths
curl -s http://localhost:4000/metrics/json | jq '.queue'

# GPU status
curl -s http://localhost:4000/health | jq '.gpu'
```

### Verify Security Features
```bash
# Check trace IDs
curl -s http://localhost:4000/health -D - | grep -i "x-trace-id"

# Check rate limiting (make 15+ rapid requests)
for i in {1..20}; do curl -s -w "%{http_code}\n" http://localhost:4000/health; done

# Check encryption module
ls -la backend/src/services/encryption.ts

# Check sandbox module
ls -la backend/src/services/sandbox.ts
```

### Database Verification
```bash
# Run migrations
psql -d codexon -f database/migrations.sql

# Check tables
psql -d codexon -c "\dt"

# Check indexes
psql -d codexon -c "\di"
```

## Environment Variables

```bash
# Backend
PORT=4000
DATABASE_URL=postgresql://user:pass@localhost:5432/codexon
REDIS_HOST=localhost
REDIS_PORT=6379
LOG_LEVEL=info
NODE_ENV=development

# Model Runtime
MODEL_RUNTIME_BASE_URL=http://localhost
```

## Troubleshooting

### Service Won't Start
```bash
# Check Redis
redis-cli ping

# Check PostgreSQL
psql -d codexon -c "SELECT 1"

# Check ports
lsof -i :4000
```

### Tests Failing
```bash
# Verify server is running
curl http://localhost:4000/health

# Check logs
cd backend && npm run dev

# Run with debug
LOG_LEVEL=debug npm run dev
```

### Performance Issues
```bash
# Check queue depths
curl http://localhost:4000/metrics/json

# Check container status
curl http://localhost:4000/health | jq '.containers'

# Run load test
cd tests && ./load-test.sh
```

## CI/CD Integration

```yaml
# Example GitHub Actions
- name: Run Tests
  run: |
    cd tests
    chmod +x *.sh
    ./security-tests.sh
    ./runtime-tests.sh
```

## Monitoring in Production

### Prometheus Queries
```promql
# Request rate
rate(codexon_inference_requests_total[5m])

# Latency
histogram_quantile(0.95, rate(codexon_inference_duration_seconds_bucket[5m]))

# Queue depth
codexon_queue_depth

# GPU utilization
codexon_gpu_utilization_percent
```
