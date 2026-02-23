-- Add coaching analysis types to analyses table
-- coaching_stage1: Full coaching output from com-discovery-coaching prompt (for history/manager review)
-- coaching_digest: Slack-ready rep digest from com-rep-digest prompt (< 300 words)

ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_analysis_type_check;
ALTER TABLE analyses ADD CONSTRAINT analyses_analysis_type_check
  CHECK (analysis_type IN (
    'active_health',
    'closed_lost',
    'closed_won',
    'customer_sentiment',
    'com_enhanced',
    'coaching_stage1',
    'coaching_digest'
  ));
