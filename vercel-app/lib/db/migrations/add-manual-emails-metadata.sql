-- Add metadata column to manual_emails table for proper soft deletes

ALTER TABLE manual_emails 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Migrate any existing |EXCLUDED flags to metadata
UPDATE manual_emails
SET metadata = '{"excluded": true}'::jsonb
WHERE import_batch_id LIKE '%|EXCLUDED';

-- Clean up the import_batch_id
UPDATE manual_emails
SET import_batch_id = REPLACE(import_batch_id, '|EXCLUDED', '')
WHERE import_batch_id LIKE '%|EXCLUDED';

-- Create index on metadata for better query performance
CREATE INDEX IF NOT EXISTS idx_manual_emails_metadata ON manual_emails USING GIN (metadata);

