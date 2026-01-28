-- Add arr column to deals table for Salesforce ARR__c field

ALTER TABLE deals ADD COLUMN IF NOT EXISTS arr DECIMAL(15, 2);
