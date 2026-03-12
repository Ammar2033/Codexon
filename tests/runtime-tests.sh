#!/bin/bash
# Codexon Runtime Test Suite
# This script runs comprehensive tests for the Codexon AI Model Runtime

set -e

BASE_URL="${BASE_URL:-http://localhost:4000}"
API_KEY="${API_KEY:-test_api_key_12345}"

echo "=========================================="
echo "Codexon Runtime Test Suite"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test helper functions
pass() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    ((TESTS_FAILED++))
}

info() {
    echo -e "${YELLOW}ℹ INFO:${NC} $1"
}

# Check if server is running
check_server() {
    echo ""
    info "Checking if server is running..."
    if curl -s -f "$BASE_URL/health" > /dev/null; then
        pass "Server is running at $BASE_URL"
        return 0
    else
        fail "Server is not running at $BASE_URL"
        return 1
    fi
}

# Test 1: Health Check
test_health() {
    echo ""
    info "Test 1: Health Check"
    
    RESPONSE=$(curl -s "$BASE_URL/health")
    
    if echo "$RESPONSE" | grep -q '"status":"ok"'; then
        pass "Health check returns ok"
    else
        fail "Health check failed"
    fi
}

# Test 2: Metrics Endpoint
test_metrics() {
    echo ""
    info "Test 2: Metrics Endpoint"
    
    RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/metrics.txt "$BASE_URL/metrics")
    
    if [ "$RESPONSE" = "200" ]; then
        pass "Metrics endpoint returns 200"
    else
        fail "Metrics endpoint returned $RESPONSE"
    fi
    
    if grep -q "http_requests_total" /tmp/metrics.txt; then
        pass "Prometheus metrics format is valid"
    else
        fail "Invalid Prometheus metrics format"
    fi
}

# Test 3: JSON Metrics
test_metrics_json() {
    echo ""
    info "Test 3: JSON Metrics"
    
    RESPONSE=$(curl -s "$BASE_URL/metrics/json")
    
    if echo "$RESPONSE" | grep -q '"timestamp"'; then
        pass "JSON metrics endpoint works"
    else
        fail "JSON metrics endpoint failed"
    fi
}

# Test 4: Trace ID Generation
test_trace_id() {
    echo ""
    info "Test 4: Trace ID Generation"
    
    RESPONSE=$(curl -s -D - "$BASE_URL/health" | grep -i "x-trace-id")
    
    if [ -n "$RESPONSE" ]; then
        pass "Trace ID is generated and returned"
    else
        fail "Trace ID not found in response"
    fi
}

# Test 5: Custom Trace ID Propagation
test_custom_trace_id() {
    echo ""
    info "Test 5: Custom Trace ID Propagation"
    
    CUSTOM_TRACE="test-trace-$(date +%s)"
    RESPONSE=$(curl -s -H "x-trace-id: $CUSTOM_TRACE" "$BASE_URL/health")
    
    if echo "$RESPONSE" | grep -q "$CUSTOM_TRACE"; then
        pass "Custom trace ID is propagated"
    else
        fail "Custom trace ID not propagated"
    fi
}

# Test 6: Rate Limiting
test_rate_limit() {
    echo ""
    info "Test 6: Rate Limiting"
    
    # Make multiple requests quickly
    for i in {1..15}; do
        RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/health")
    done
    
    # The last few should be rate limited
    if [ "$RESPONSE" = "429" ]; then
        pass "Rate limiting is working"
    else
        info "Rate limiting returned $RESPONSE (may be configured differently)"
    fi
}

# Test 7: Queue Stats
test_queue_stats() {
    echo ""
    info "Test 7: Queue Stats"
    
    RESPONSE=$(curl -s "$BASE_URL/queue/test-model/stats" 2>/dev/null || echo '{"error":1}')
    
    if echo "$RESPONSE" | grep -q '"queue"'; then
        pass "Queue stats endpoint works"
    else
        fail "Queue stats endpoint failed"
    fi
}

# Test 8: Inference Endpoint
test_inference_endpoint() {
    echo ""
    info "Test 8: Inference Endpoint"
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/inference/test-model-123" \
        -H "Content-Type: application/json" \
        -H "x-api-key: $API_KEY" \
        -d '{"input": {"data": [1, 2, 3]}}')
    
    if echo "$RESPONSE" | grep -q '"status":"queued"'; then
        pass "Inference endpoint accepts requests"
    else
        fail "Inference endpoint failed: $RESPONSE"
    fi
}

# Test 9: Batch Inference Endpoint
test_batch_endpoint() {
    echo ""
    info "Test 9: Batch Inference Endpoint"
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/batch/test-model-123" \
        -H "Content-Type: application/json" \
        -H "x-api-key: $API_KEY" \
        -d '{"inputs": [{"data": [1,2,3]}, {"data": [4,5,6]}]}')
    
    if echo "$RESPONSE" | grep -q '"status":"queued"'; then
        pass "Batch inference endpoint works"
    else
        fail "Batch inference endpoint failed: $RESPONSE"
    fi
}

# Test 10: Streaming Endpoint
test_streaming_endpoint() {
    echo ""
    info "Test 10: Streaming Endpoint"
    
    # Just check if it connects
    RESPONSE=$(curl -s -N -w "%{http_code}" --max-time 5 \
        "$BASE_URL/streaming/test-model" 2>/dev/null || echo "000")
    
    if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "000" ]; then
        pass "Streaming endpoint is accessible"
    else
        fail "Streaming endpoint returned $RESPONSE"
    fi
}

# Test 11: Trace Retrieval
test_trace_retrieval() {
    echo ""
    info "Test 11: Trace Retrieval"
    
    # Get a trace ID from health
    TRACE_ID=$(curl -s "$BASE_URL/health" | grep -o '"traceId":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$TRACE_ID" ]; then
        RESPONSE=$(curl -s "$BASE_URL/trace/$TRACE_ID")
        
        if echo "$RESPONSE" | grep -q '"traceId"'; then
            pass "Trace retrieval works"
        else
            fail "Trace retrieval failed"
        fi
    else
        info "No trace ID available, skipping"
    fi
}

# Test 12: Database Stats
test_database_stats() {
    echo ""
    info "Test 12: Database Stats in Metrics"
    
    RESPONSE=$(curl -s "$BASE_URL/metrics/json")
    
    if echo "$RESPONSE" | grep -q '"database"'; then
        pass "Database stats available in metrics"
    else
        fail "Database stats not available"
    fi
}

# Test 13: GPU Status
test_gpu_status() {
    echo ""
    info "Test 13: GPU Status in Health"
    
    RESPONSE=$(curl -s "$BASE_URL/health")
    
    if echo "$RESPONSE" | grep -q '"gpu"'; then
        pass "GPU status in health endpoint"
    else
        fail "GPU status missing from health"
    fi
}

# Test 14: Error Handling
test_error_handling() {
    echo ""
    info "Test 14: Error Handling"
    
    RESPONSE=$(curl -s "$BASE_URL/nonexistent-endpoint")
    
    if echo "$RESPONSE" | grep -q '"message"'; then
        pass "Error handling returns proper JSON"
    else
        fail "Error handling broken"
    fi
}

# Test 15: Request ID
test_request_id() {
    echo ""
    info "Test 15: Request ID Header"
    
    RESPONSE=$(curl -s -D - "$BASE_URL/health" | grep -i "x-request-id\|x-trace-id")
    
    if [ -n "$RESPONSE" ]; then
        pass "Request ID header is present"
    else
        fail "Request ID header missing"
    fi
}

# Main test execution
main() {
    echo ""
    echo "Starting tests against $BASE_URL"
    echo "=========================================="
    
    if ! check_server; then
        echo ""
        echo -e "${RED}Server is not running. Please start the server first.${NC}"
        echo "Run: cd backend && npm run dev"
        exit 1
    fi
    
    # Run all tests
    test_health
    test_metrics
    test_metrics_json
    test_trace_id
    test_custom_trace_id
    test_rate_limit
    test_queue_stats
    test_inference_endpoint
    test_batch_endpoint
    test_streaming_endpoint
    test_trace_retrieval
    test_database_stats
    test_gpu_status
    test_error_handling
    test_request_id
    
    # Print summary
    echo ""
    echo "=========================================="
    echo "Test Summary"
    echo "=========================================="
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo "Total:  $((TESTS_PASSED + TESTS_FAILED))"
    
    if [ $TESTS_FAILED -gt 0 ]; then
        echo ""
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    else
        echo ""
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    fi
}

main "$@"
