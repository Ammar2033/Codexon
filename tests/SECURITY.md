# Codexon Security Verification Guide

## Overview

This document outlines the security features implemented in the Codexon platform and provides verification procedures.

## Implemented Security Features

### 1. Model Weight Encryption

**Location**: `backend/src/services/encryption.ts`

**Features**:
- AES-256-GCM encryption for model weights at rest
- Key derivation using PBKDF2
- Per-model encryption keys
- Automatic decryption for container runtime

**Verification**:
```bash
# Check encryption service exists
ls -la backend/src/services/encryption.ts

# Verify encryption functions exist
grep -n "encryptModelWeights\|decryptModelWeights" backend/src/services/encryption.ts
```

### 2. Container Sandboxing

**Location**: `backend/src/services/sandbox.ts`

**Features**:
- AppArmor profile enforcement
- Seccomp profile for syscalls
- Isolated Docker networks per container
- Read-only root filesystem option
- Resource limits (CPU, memory, GPU)

**Verification**:
```bash
# Check sandbox service
ls -la backend/src/services/sandbox.ts

# Verify security functions
grep -n "AppArmor\|Seccomp\|createIsolatedNetwork" backend/src/services/sandbox.ts
```

### 3. API Key Security

**Implementation**:
- Keys are hashed using bcrypt before storage
- Only hashed values stored in database
- Per-key rate limiting
- Per-key usage tracking

**Verification**:
```bash
# Check auth middleware
ls -la backend/src/middleware/auth.ts

# Verify key hashing
grep -n "hash\|bcrypt" backend/src/services/*.ts
```

### 4. Rate Limiting

**Implementation**:
- Global rate limit: 200 requests/15 min
- Per-model rate limit: 100 requests/min
- Per-API-key tracking

**Verification**:
```bash
# Run many requests quickly
for i in {1..20}; do curl -s http://localhost:4000/health; done

# Should get 429 after limit
```

### 5. Distributed Tracing & Audit

**Location**: `backend/src/middleware/tracing.ts`

**Features**:
- Unique trace ID per request
- Span tracking through entire request lifecycle
- All requests logged with trace context
- Integration with Pino logger

**Verification**:
```bash
# Check trace ID in response
curl -s http://localhost:4000/health -D - | grep -i "x-trace-id"

# Verify tracing middleware
ls -la backend/src/middleware/tracing.ts
```

### 6. Database Security

**Implementation**:
- Parameterized queries (no SQL injection)
- Proper indexing for performance
- Request traces table for audit
- API key hashing in database

**Verification**:
```bash
# Check schema
cat database/schema.sql | grep -i "index\|hash"
```

## Network Security

### Container Isolation

Each model container runs in an isolated network:
- No direct container-to-container communication
- All traffic through API gateway
- Container can't access host network directly

### Firewall Rules

```bash
# Verify Docker network isolation
docker network ls | grep codexon

# Check container network
docker inspect <container-id> | grep -A 10 Networks
```

## Security Test Commands

### Run Security Tests
```bash
cd tests
chmod +x security-tests.sh
./security-tests.sh
```

### Run All Runtime Tests
```bash
cd tests
chmod +x runtime-tests.sh
./runtime-tests.sh
```

### Run Load Tests
```bash
cd tests
chmod +x load-test.sh
CONCURRENT=50 DURATION=30 ./load-test.sh
```

## Manual Security Verification

### 1. Verify Encryption
```bash
# Check encryption service
curl -s http://localhost:4000/health | grep -q "ok" && echo "Service running"

# Check encryption file
test -f backend/src/services/encryption.ts && echo "Encryption module exists"
```

### 2. Verify Sandbox
```bash
# Check sandbox config in runtime manager
grep -n "sandbox\|AppArmor" backend/src/services/runtime_manager.ts
```

### 3. Verify Isolation
```bash
# Check container pool isolation
grep -n "acquireContainer\|releaseContainer" backend/src/services/container_pool.ts
```

### 4. Verify Tracing
```bash
# Test trace propagation
TRACE_ID="test-123" curl -s http://localhost:4000/health -D - | grep -i trace
```

## Known Security Considerations

### Production Recommendations

1. **Enable AppArmor**: Configure AppArmor on production nodes
2. **Use Sysbox**: Consider Sysbox for stronger container isolation
3. **GPU Isolation**: Use NVIDIA MPS for fractional GPU sharing
4. **Network Policies**: Implement Kubernetes network policies
5. **Secrets Management**: Use HashiCorp Vault for API keys
6. **TLS**: Enable TLS for all internal communication
7. **Audit Logs**: Ship logs to centralized logging system

### Security Checklist

- [x] Model weight encryption at rest
- [x] Container sandboxing (AppArmor)
- [x] Rate limiting per API key
- [x] Distributed tracing
- [x] API key hashing
- [ ] TLS for internal communication
- [ ] Network policies
- [ ] Secrets management

## Incident Response

If a security incident is detected:

1. **Identify**: Check trace IDs in logs
2. **Isolate**: Use container pool to isolate affected model
3. **Remediate**: Update model version or disable model
4. **Audit**: Review request_traces table
5. **Report**: Generate security report

## Contact

For security issues, contact: security@codexon.ai
