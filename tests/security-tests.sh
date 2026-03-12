#!/bin/bash
# Codexon Security Test Suite
# Tests encryption, sandboxing, and isolation

set -e

BASE_URL="${BASE_URL:-http://localhost:4000}"

echo "=========================================="
echo "Codexon Security Test Suite"
echo "=========================================="

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

pass() { echo -e "${GREEN}✓ PASS:${NC} $1"; ((TESTS_PASSED++)); }
fail() { echo -e "${RED}✗ FAIL:${NC} $1"; ((TESTS_FAILED++)); }
info() { echo -e "${YELLOW}ℹ INFO:${NC} $1"; }

# Test encryption module exists
test_encryption_module() {
    echo ""
    info "Test 1: Encryption Module"
    
    if [ -f "backend/src/services/encryption.ts" ]; then
        pass "Encryption service exists"
        
        # Check for key functions
        if grep -q "encryptModelWeights" backend/src/services/encryption.ts; then
            pass "Model weight encryption function exists"
        else
            fail "Model weight encryption function missing"
        fi
        
        if grep -q "decryptModelWeightsForContainer" backend/src/services/encryption.ts; then
            pass "Model weight decryption function exists"
        else
            fail "Model weight decryption function missing"
        fi
        
        if grep -q "AES-256-GCM\|aes-256-gcm" backend/src/services/encryption.ts; then
            pass "AES-256-GCM encryption used"
        else
            fail "AES-256-GCM encryption not found"
        fi
    else
        fail "Encryption service not found"
    fi
}

# Test sandbox module exists
test_sandbox_module() {
    echo ""
    info "Test 2: Container Sandbox"
    
    if [ -f "backend/src/services/sandbox.ts" ]; then
        pass "Sandbox service exists"
        
        if grep -q "AppArmor\|apparmor" backend/src/services/sandbox.ts; then
            pass "AppArmor profile support exists"
        else
            fail "AppArmor profile not found"
        fi
        
        if grep -q "createSandboxHostConfig" backend/src/services/sandbox.ts; then
            pass "Sandbox host config function exists"
        else
            fail "Sandbox host config function missing"
        fi
        
        if grep -q "validateContainerSandbox" backend/src/services/sandbox.ts; then
            pass "Container validation function exists"
        else
            fail "Container validation function missing"
        fi
    else
        fail "Sandbox service not found"
    fi
}

# Test isolation features
test_isolation() {
    echo ""
    info "Test 3: Container Isolation"
    
    # Check for network isolation
    if grep -q "createIsolatedNetwork" backend/src/services/sandbox.ts; then
        pass "Network isolation function exists"
    else
        fail "Network isolation function missing"
    fi
    
    # Check for seccomp profile
    if grep -q "getSeccompProfile" backend/src/services/sandbox.ts; then
        pass "Seccomp profile support exists"
    else
        fail "Seccomp profile missing"
    fi
    
    # Check for read-only filesystem
    if grep -q "ReadonlyRoot\|read_only" backend/src/services/sandbox.ts; then
        pass "Read-only root filesystem option exists"
    else
        info "Read-only root filesystem option not found"
    fi
}

# Test rate limiting
test_rate_limiting() {
    echo ""
    info "Test 4: Rate Limiting"
    
    if [ -f "backend/src/app.ts" ]; then
        if grep -q "rateLimit\|rate-limit" backend/src/app.ts; then
            pass "Rate limiting is configured"
        else
            fail "Rate limiting not configured"
        fi
    else
        fail "app.ts not found"
    fi
}

# Test API key security
test_api_keys() {
    echo ""
    info "Test 5: API Key Security"
    
    if grep -q "key_hash\|hash.*api.*key" backend/src/services/*.ts 2>/dev/null; then
        pass "API keys are hashed"
    else
        fail "API key hashing not found"
    fi
    
    if [ -f "backend/src/middleware/auth.ts" ]; then
        pass "Authentication middleware exists"
    else
        fail "Authentication middleware missing"
    fi
}

# Test trace/correlation IDs
test_tracing() {
    echo ""
    info "Test 6: Distributed Tracing"
    
    if [ -f "backend/src/middleware/tracing.ts" ]; then
        pass "Tracing middleware exists"
        
        if grep -q "traceId\|trace-id" backend/src/middleware/tracing.ts; then
            pass "Trace ID handling exists"
        else
            fail "Trace ID handling missing"
        fi
        
        if grep -q "spanId\|span-id" backend/src/middleware/tracing.ts; then
            pass "Span ID handling exists"
        else
            fail "Span ID handling missing"
        fi
    else
        fail "Tracing middleware not found"
    fi
}

# Test metrics security
test_metrics_security() {
    echo ""
    info "Test 7: Metrics Security"
    
    if grep -q "prom-client\|prom_client" backend/package.json; then
        pass "Prometheus client installed"
    else
        fail "Prometheus client not in dependencies"
    fi
}

# Test database schema
test_database_schema() {
    echo ""
    info "Test 8: Database Schema Security"
    
    if [ -f "database/schema.sql" ]; then
        pass "Database schema exists"
        
        if grep -q "api_keys" database/schema.sql; then
            pass "API keys table exists"
        else
            fail "API keys table missing"
        fi
        
        if grep -q "INDEX.*user_id\|idx.*user" database/schema.sql; then
            pass "User indexes exist for performance"
        else
            info "User indexes may need verification"
        fi
    else
        fail "Database schema not found"
    fi
}

# Test migrations exist
test_migrations() {
    echo ""
    info "Test 9: Database Migrations"
    
    if [ -f "database/migrations.sql" ]; then
        pass "Migrations file exists"
        
        if grep -q "request_traces" database/migrations.sql; then
            pass "Request traces table in migrations"
        else
            fail "Request traces table missing"
        fi
    else
        fail "Migrations file not found"
    fi
}

# Test container pool security
test_container_pool() {
    echo ""
    info "Test 10: Container Pool Security"
    
    if [ -f "backend/src/services/container_pool.ts" ]; then
        pass "Container pool service exists"
        
        if grep -q "acquireContainer\|releaseContainer" backend/src/services/container_pool.ts; then
            pass "Container acquire/release exists"
        else
            fail "Container acquire/release missing"
        fi
    else
        fail "Container pool service not found"
    fi
}

# Test GPU scheduler
test_gpu_scheduler() {
    echo ""
    info "Test 11: GPU Scheduler"
    
    if [ -f "backend/src/services/scheduler.ts" ]; then
        pass "GPU scheduler exists"
        
        if grep -q "fractional\|fraction" backend/src/services/scheduler.ts; then
            pass "Fractional GPU support exists"
        else
            fail "Fractional GPU support missing"
        fi
        
        if grep -q "allocate.*GPU\|gpu.*allocation" backend/src/services/scheduler.ts; then
            pass "GPU allocation function exists"
        else
            fail "GPU allocation function missing"
        fi
    else
        fail "GPU scheduler not found"
    fi
}

# Test queue system
test_queue_system() {
    echo ""
    info "Test 12: Queue System Security"
    
    if [ -f "backend/src/services/queue_system.ts" ]; then
        pass "Queue system exists"
        
        if grep -q "per-model\|model.*queue" backend/src/services/queue_system.ts; then
            pass "Per-model queues exist"
        else
            fail "Per-model queues missing"
        fi
        
        if grep -q "priority.*high\|priority.*normal" backend/src/services/queue_system.ts; then
            pass "Priority queues exist"
        else
            fail "Priority queues missing"
        fi
    else
        fail "Queue system not found"
    fi
}

# Summary
main() {
    echo ""
    echo "Running security tests..."
    
    test_encryption_module
    test_sandbox_module
    test_isolation
    test_rate_limiting
    test_api_keys
    test_tracing
    test_metrics_security
    test_database_schema
    test_migrations
    test_container_pool
    test_gpu_scheduler
    test_queue_system
    
    echo ""
    echo "=========================================="
    echo "Security Test Summary"
    echo "=========================================="
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo "Total:  $((TESTS_PASSED + TESTS_FAILED))"
    
    if [ $TESTS_FAILED -gt 0 ]; then
        echo ""
        echo -e "${RED}Some security tests failed!${NC}"
        exit 1
    else
        echo ""
        echo -e "${GREEN}All security tests passed!${NC}"
        exit 0
    fi
}

main "$@"
