-- Add com_enhanced to analysis_type check constraint
ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_analysis_type_check;
ALTER TABLE analyses ADD CONSTRAINT analyses_analysis_type_check
  CHECK (analysis_type IN ('active_health', 'closed_lost', 'closed_won', 'customer_sentiment', 'com_enhanced'));
