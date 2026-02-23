/**
 * Database model types
 */

export interface Deal {
  id: string;
  crm_id: string;
  name: string;
  stage: string;
  amount?: number;
  currency?: string;
  account_name?: string;
  opportunity_type?: string;
  owner_name?: string;
  role_segment?: string;
  arr?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Interaction {
  id: string;
  deal_id: string | null;
  external_id: string;
  type: 'call' | 'email';
  title?: string;
  timestamp: Date;
  duration?: number;
  participants: any[];
  blob_url: string;
  source: 'gong_webhook' | 'manual_import' | 'gong_api';
  metadata?: any;
  created_at: Date;
}

export interface ManualEmail {
  id: string;
  deal_id: string;
  subject: string;
  from_email: string;
  to_email: string;
  timestamp: Date;
  blob_url: string;
  import_batch_id?: string;
  created_at: Date;
}

export interface Analysis {
  id: string;
  deal_id: string;
  analysis_type: 'active_health' | 'closed_lost' | 'closed_won' | 'customer_sentiment' | 'com_enhanced' | 'coaching_stage1' | 'coaching_digest';
  exec_summary: string;
  next_steps: string;
  details: any;
  structured_data?: ComEnhancedStructuredData | CoachingStage1Data | CoachingDigestData;
  slack_thread_ts?: string;
  slack_channel?: string;
  created_at: Date;
}

/**
 * Structured data from Command of Message Enhanced Analysis
 */
export interface ComEnhancedStructuredData {
  dealHealthScore: number;
  probability: number; // 0-100 probability of close
  momentum: 'Accelerating' | 'Steady' | 'Decelerating' | 'Stalled';
  confidenceLevel: 'High' | 'Medium' | 'Low';
  buyerScenario: 'Greenfield' | 'Rip-and-Replace' | 'Unknown';
  primaryValueDriver: 'Risk' | 'Scale' | 'Global' | 'Unknown';
  decisionStage: 'Early Discovery' | 'Evaluation' | 'Selection' | 'Negotiation';
  discoveryExecution: 'Strong' | 'Adequate' | 'Weak';
  valueAlignment: 'Aligned' | 'Partial' | 'Misaligned';
  competitivePosition: 'Strong' | 'Neutral' | 'At Risk' | 'Unknown';
  differentiators: {
    big4TaxExpertise: DifferentiatorAssessment;
    auditReadyAI: DifferentiatorAssessment;
    globalCoverage: DifferentiatorAssessment;
    fastImplementation: DifferentiatorAssessment;
    enterpriseSecurity: DifferentiatorAssessment;
    modernExperience: DifferentiatorAssessment;
  };
  positiveIndicators: string[];
  criticalIssues: string[];
  mediumRisks: string[];
  minorConcerns: string[];
  currentNextSteps: string;
  untappedOpportunities: string;
  dealSummary: string;
}

export interface DifferentiatorAssessment {
  relevant: 'High' | 'Medium' | 'Low' | 'N/A';
  positioned: 'Yes' | 'Partially' | 'No';
  proofPoint: boolean;
}

/**
 * Structured data for coaching_stage1 analysis rows
 */
export interface CoachingStage1Data {
  interaction_id: string;
  stage: string; // Salesforce StageName
  stageContext: string; // formatted markdown block injected into prompt
  fieldGaps: FieldGap[];
  mantraAssessment: MantraAssessment;
}

export interface FieldGap {
  field: string;
  expectedState: string;
  actualValue: string | null;
  severity: 'critical' | 'moderate' | 'low';
}

export interface MantraAssessment {
  value: string | null;
  qualityForStage: 'not_yet' | 'emerging' | 'strong' | 'confirmed' | 'executive_resonant' | 'complete';
  isGap: boolean;
}

/**
 * Structured data for coaching_digest analysis rows
 */
export interface CoachingDigestData {
  interaction_id: string;
  slackDigest: string; // Part 1 — rep-facing, < 300 words
  botFeedback: string; // Part 2 — system-facing prompt improvement notes
}

export interface ApiKey {
  id: string;
  name: string;
  description?: string;
  key_hash: string;
  key_prefix: string;
  created_by?: string;
  created_at: Date;
  last_used_at?: Date;
  revoked_at?: Date;
  revoked_by?: string;
  metadata?: Record<string, unknown>;
}

