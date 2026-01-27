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
  analysis_type: 'active_health' | 'closed_lost' | 'closed_won' | 'customer_sentiment';
  exec_summary: string;
  next_steps: string;
  details: any;
  slack_thread_ts?: string;
  slack_channel?: string;
  created_at: Date;
}

