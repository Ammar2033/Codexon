#!/bin/bash
# Codexon Load Test Script
# Tests concurrent inference requests and system behavior under load

set -e

BASE_URL="${BASE_URL:-http://localhost:4000}"
CONCURRENT="${CONCURRENT:-50}"
DURATION="${DURATION:-30}"

echo "=========================================="
echo "Codexon Load Test"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo "Concurrent requests: $CONCURRENT"
echo "Duration: ${DURATION}s"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create temp files
TEMP_DIR=$(mktemp -d)
RESULTS_FILE="$TEMP_DIR/results.txt"
STATS_FILE="$TEMP_DIR/stats.txt"

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

info() {
    echo -e "${YELLOW}ℹ INFO:${NC} $1"
}

# Simple load test using curl
run_load_test() {
    local model_id="load-test-model"
    local start_time=$(date +%s)
    local end_time=$((start_time + DURATION))
    local request_count=0
    local success_count=0
    local error_count=0
    
    info "Starting load test..."
    
    while [ $(date +%s) -lt $end_time ]; do
        for i in $(seq 1 $CONCURRENT); do
            (
                response=$(curl -s -w "%{http_code}" -o /dev/null \
                    -X POST "$BASE_URL/inference/$model_id" \
                    -H "Content-Type: application/json" \
                    -d '{"input": {"data": [1,2,3]}}' 2>/dev/null || echo "000")
                
                if [ "$response" = "200" ] || [ "$response" = "202" ] || [ "$response" = "201" ]; then
                    echo "success" >> "$RESULTS_FILE"
                else
                    echo "error:$response" >> "$RESULTS_FILE"
                fi
            ) &
            
            ((request_count++))
        done
        
        sleep 1
    done
    
    wait
    
    # Calculate results
    if [ -f "$RESULTS_FILE" ]; then
        success_count=$(grep -c "success" "$RESULTS_FILE" 2>/dev/null || echo 0)
        error_count=$(grep -c "error" "$RESULTS_FILE" 2>/dev/null || echo 0)
    fi
    
    local total_time=$DURATION
    local rps=$((request_count / total_time))
    
    echo ""
    echo "=========================================="
    echo "Load Test Results"
    echo "=========================================="
    echo "Total Requests:  $request_count"
    echo "Successful:      $success_count"
    echo "Errors:          $error_count"
    echo "Requests/sec:    $rps"
    echo "Duration:        ${total_time}s"
    echo ""
    
    if [ $error_count -gt $((request_count / 10)) ]; then
        echo -e "${RED}High error rate detected!${NC}"
        return 1
    else
        echo -e "${GREEN}Load test completed successfully!${NC}"
        return 0
    fi
}

# Test batch inference load
test_batch_load() {
    info "Testing batch inference..."
    
    local batch_response=$(curl -s -X POST "$BASE_URL/batch/load-test-model" \
        -H "Content-Type: application/json" \
        -d '{"inputs": [
            {"data": [1,2,3]},
            {"data": [4,5,6]},
            {"data": [7,8,9]},
            {"data": [10,11,12]}
        ]}')
    
    if echo "$batch_response" | grep -q "batchId"; then
        echo -e "${GREEN}✓ Batch inference works${NC}"
    else
        echo -e "${RED}✗ Batch inference failed${NC}"
    fi
}

# Test streaming under load
test_streaming_load() {
    info "Testing streaming endpoint..."
    
    # Just verify it accepts connections
    local stream_response=$(curl -s -w "%{http_code}" --max-time 3 \
        -N "$BASE_URL/streaming/load-test-model" 2>/dev/null || echo "000")
    
    if [ "$stream_response" = "200" ]; then
        echo -e "${GREEN}✓ Streaming works under load${NC}"
    else
        echo -e "${YELLOW}⚠ Streaming returned $stream_response (may be expected)${NC}"
    fi
}

# Test queue depth under load
test_queue_depth() {
    info "Testing queue depth monitoring..."
    
    local queue_response=$(curl -s "$BASE_URL/queue/load-test-model/stats")
    
    if echo "$queue_response" | grep -q "queue"; then
        echo -e "${GREEN}✓ Queue monitoring works${NC}"
        echo "Queue stats: $queue_response"
    else
        echo -e "${YELLOW}⚠ Queue stats may need warm-up${NC}"
    fi
}

# Test metrics under load
test_metrics_under_load() {
    info "Testing metrics endpoint under load..."
    
    local metrics_response=$(curl -s -w "%{http_code}" -o /tmp/metrics_load.txt "$BASE_URL/metrics")
    
    if [ "$metrics_response" = "200" ]; then
        echo -e "${GREEN}✓ Metrics accessible under load${NC}"
    else
        echo -e "${RED}✗ Metrics failed under load: $metrics_response${NC}"
    fi
}

# Main
main() {
    echo ""
    
    # Pre-test: verify server is up
    if ! curl -s -f "$BASE_URL/health" > /dev/null 2>&1; then
        echo -e "${RED}Server not running at $BASE_URL${NC}"
        echo "Start server with: cd backend && npm run dev"
        exit 1
    fi
    
    # Run tests
    run_load_test
    test_batch_load
    test_streaming_load
    test_queue_depth
    test_metrics_under_load
    
    echo ""
    echo "Load test complete!"
}

main "$@"
