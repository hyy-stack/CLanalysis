-- Extend deals table with missing columns for dashboard
ALTER TABLE deals ADD COLUMN IF NOT EXISTS team VARCHAR(255);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);
