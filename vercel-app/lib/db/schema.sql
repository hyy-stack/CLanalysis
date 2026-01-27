-- Anrok Deal Analyzer Database Schema
-- For Vercel Postgres

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Deals table: Core deal/opportunity information
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crm_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(500) NOT NULL,
  stage VARCHAR(50) NOT NULL,
  amount DECIMAL(15, 2),
  currency VARCHAR(10) DEFAULT 'USD',
  account_name VARCHAR(500),
  opportunity_type VARCHAR(100),
  owner_name VARCHAR(255),
  role_segment VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index on CRM ID for fast lookups
CREATE INDEX IF NOT EXISTS idx_deals_crm_id ON deals(crm_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON deals(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_role_segment ON deals(role_segment);

-- Interactions table: Both calls and emails
CREATE TABLE IF NOT EXISTS interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  external_id VARCHAR(255) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('call', 'email')),
  title VARCHAR(1000),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  duration INTEGER, -- seconds, for calls only
  participants JSONB, -- Array of participant objects
  blob_url TEXT NOT NULL, -- Reference to Vercel Blob
  source VARCHAR(50) NOT NULL CHECK (source IN ('gong_webhook', 'manual_import', 'gong_api')),
  metadata JSONB, -- Additional metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for querying interactions
CREATE INDEX IF NOT EXISTS idx_interactions_deal_id ON interactions(deal_id);
CREATE INDEX IF NOT EXISTS idx_interactions_external_id ON interactions(external_id);
CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_deal_timestamp ON interactions(deal_id, timestamp);

-- Manual emails table: Emails imported outside of Gong
CREATE TABLE IF NOT EXISTS manual_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  subject VARCHAR(1000),
  from_email VARCHAR(500),
  to_email VARCHAR(500),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  blob_url TEXT NOT NULL,
  import_batch_id VARCHAR(100),
  metadata JSONB, -- Additional metadata including exclusion flag
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for manual emails
CREATE INDEX IF NOT EXISTS idx_manual_emails_deal_id ON manual_emails(deal_id);
CREATE INDEX IF NOT EXISTS idx_manual_emails_timestamp ON manual_emails(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_manual_emails_batch ON manual_emails(import_batch_id);

-- Analyses table: Results from Claude analysis
CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  analysis_type VARCHAR(50) NOT NULL CHECK (analysis_type IN ('active_health', 'closed_lost', 'closed_won', 'customer_sentiment')),
  exec_summary TEXT,
  next_steps TEXT,
  details JSONB, -- Structured analysis output
  slack_thread_ts VARCHAR(100), -- Slack message timestamp
  slack_channel VARCHAR(50), -- Slack channel ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for analyses
CREATE INDEX IF NOT EXISTS idx_analyses_deal_id ON analyses(deal_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_deal_created ON analyses(deal_id, created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on deals
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample queries for reference
-- 
-- Get all interactions for a deal (chronological):
-- SELECT * FROM interactions WHERE deal_id = $1 ORDER BY timestamp ASC;
--
-- Get deal with recent analysis:
-- SELECT d.*, a.* FROM deals d 
-- LEFT JOIN analyses a ON d.id = a.deal_id 
-- WHERE d.crm_id = $1 
-- ORDER BY a.created_at DESC LIMIT 1;
--
-- Count interactions by deal:
-- SELECT deal_id, type, COUNT(*) as count 
-- FROM interactions 
-- GROUP BY deal_id, type;

