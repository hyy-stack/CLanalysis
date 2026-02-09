-- Add API keys table for multi-client authentication
-- Keys are stored hashed (SHA-256) with prefix for logging

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  key_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hash (64 hex chars)
  key_prefix VARCHAR(8) NOT NULL,         -- "dak_xxxx" for logging/identification
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,    -- NULL = active, set = revoked
  revoked_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'             -- Future: scopes, rate limits
);

-- Index for fast hash lookups during authentication
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);

-- Index for listing active keys
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked_at ON api_keys (revoked_at) WHERE revoked_at IS NULL;
