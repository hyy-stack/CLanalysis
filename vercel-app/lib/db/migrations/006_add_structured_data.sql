-- Add structured_data JSONB column for storing parsed analysis fields
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS structured_data JSONB;

-- Index for querying by specific fields within the JSON
CREATE INDEX IF NOT EXISTS idx_analyses_structured_data ON analyses USING GIN (structured_data);
