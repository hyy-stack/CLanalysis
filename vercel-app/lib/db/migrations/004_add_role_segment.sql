-- Add role_segment column to deals table for Salesforce Role_Segment__c field

ALTER TABLE deals ADD COLUMN IF NOT EXISTS role_segment VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_deals_role_segment ON deals(role_segment);
