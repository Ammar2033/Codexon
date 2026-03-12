-- Codexon Database Migrations
-- Run these to upgrade from v1.0 to v1.1

-- Migration 001: Add missing columns to model_versions
ALTER TABLE model_versions 
    ADD COLUMN IF NOT EXISTS storage_path VARCHAR(512),
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'staging',
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Migration 002: Create indexes for model_versions
CREATE INDEX IF NOT EXISTS idx_model_versions_model_id ON model_versions(model_id);
CREATE INDEX IF NOT EXISTS idx_model_versions_status ON model_versions(status);
CREATE INDEX IF NOT EXISTS idx_model_versions_is_default ON model_versions(model_id, is_default) WHERE is_default = TRUE;

-- Migration 003: Add indexes for usage_events
CREATE INDEX IF NOT EXISTS idx_usage_events_model_id ON usage_events(model_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp DESC);

-- Migration 004: Add indexes for api_keys
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- Migration 005: Add performance indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);

-- Migration 006: Update existing model_versions to have proper status
UPDATE model_versions SET status = 'active' WHERE status IS NULL OR status = '';
UPDATE model_versions SET is_default = TRUE WHERE id IN (
    SELECT MIN(id) FROM model_versions GROUP BY model_id HAVING COUNT(*) = 1
);

-- Migration 007: Add GPU resource tracking table
CREATE TABLE IF NOT EXISTS gpu_nodes (
    id SERIAL PRIMARY KEY,
    node_name VARCHAR(255) UNIQUE NOT NULL,
    hostname VARCHAR(255),
    total_memory_mb INTEGER,
    used_memory_mb INTEGER DEFAULT 0,
    total_gpu_memory_mb INTEGER,
    used_gpu_memory_mb INTEGER DEFAULT 0,
    gpu_count INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'available',
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gpu_nodes_status ON gpu_nodes(status);

-- Migration 008: Add container tracking table
CREATE TABLE IF NOT EXISTS containers (
    id SERIAL PRIMARY KEY,
    container_id VARCHAR(255) UNIQUE,
    model_id INTEGER REFERENCES models(id),
    node_name VARCHAR(255),
    port INTEGER,
    status VARCHAR(50) DEFAULT 'starting',
    gpu_fraction DECIMAL(5, 2) DEFAULT 1.0,
    memory_limit_mb INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE,
    stopped_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_containers_model_id ON containers(model_id);
CREATE INDEX IF NOT EXISTS idx_containers_status ON containers(status);
CREATE INDEX IF NOT EXISTS idx_containers_node_name ON containers(node_name);

-- Migration 009: Add request tracing table
CREATE TABLE IF NOT EXISTS request_traces (
    id SERIAL PRIMARY KEY,
    trace_id VARCHAR(255) UNIQUE NOT NULL,
    request_id VARCHAR(255),
    model_id INTEGER REFERENCES models(id),
    user_id INTEGER REFERENCES users(id),
    endpoint VARCHAR(255),
    method VARCHAR(10),
    status_code INTEGER,
    latency_ms INTEGER,
    container_id VARCHAR(255),
    node_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_request_traces_trace_id ON request_traces(trace_id);
CREATE INDEX IF NOT EXISTS idx_request_traces_model_id ON request_traces(model_id);
CREATE INDEX IF NOT EXISTS idx_request_traces_created_at ON request_traces(created_at DESC);

-- Migration 010: Add rate limit tracking
CREATE TABLE IF NOT EXISTS rate_limits (
    id SERIAL PRIMARY KEY,
    api_key_id INTEGER REFERENCES api_keys(id),
    endpoint VARCHAR(255),
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    window_end TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(api_key_id, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_api_key ON rate_limits(api_key_id, window_start);

-- Migration 011: Add model pricing cache
ALTER TABLE models 
    ADD COLUMN IF NOT EXISTS price_per_1k_requests DECIMAL(10, 4) DEFAULT 0.002,
    ADD COLUMN IF NOT EXISTS price_per_second DECIMAL(10, 6) DEFAULT 0.0001;

-- Migration 012: Add user isolation
ALTER TABLE models 
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS allowed_user_ids INTEGER[];

-- Run migrations in order: psql -d codexon -f migrations.sql
