
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_creator BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE models (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- draft / deployed / published
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE model_versions (
    id SERIAL PRIMARY KEY,
    model_id INTEGER REFERENCES models(id),
    version VARCHAR(50) NOT NULL,
    storage_path VARCHAR(512),
    codexon_config JSONB,
    status VARCHAR(50) DEFAULT 'staging',
    is_default BOOLEAN DEFAULT FALSE,
    deployed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(model_id, version)
);

CREATE INDEX idx_model_versions_model_id ON model_versions(model_id);
CREATE INDEX idx_model_versions_status ON model_versions(status);
CREATE INDEX idx_model_versions_is_default ON model_versions(model_id, is_default) WHERE is_default = TRUE;

CREATE TABLE api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE usage_events (
    id SERIAL PRIMARY KEY,
    model_id INTEGER REFERENCES models(id),
    user_id INTEGER REFERENCES users(id),
    latency INTEGER, -- in milliseconds
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    request_size INTEGER -- in bytes
);

CREATE TABLE wallets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) UNIQUE,
    balance DECIMAL(12, 2) DEFAULT 0.00
);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    wallet_id INTEGER REFERENCES wallets(id),
    amount DECIMAL(12, 2) NOT NULL,
    type VARCHAR(50), -- 'deposit', 'withdrawal', 'revenue'
    related_usage_event INTEGER REFERENCES usage_events(id),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
