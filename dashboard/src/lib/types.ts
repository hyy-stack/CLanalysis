export interface Deal {
  id: string;
  crm_id: string | null;
  name: string;
  stage: string | null;
  amount: number | null;
  currency: string;
  account_name: string | null;
  opportunity_type: string | null;
  owner_name: string | null;
  owner_email: string | null;
  team: string | null;
  role_segment: string | null;
  arr: number | null;
  created_at: string;
  updated_at: string;
  // computed/joined fields
  call_count?: number;
  email_count?: number;
  last_activity_at?: string | null;
  has_analysis?: boolean;
  latest_analysis_type?: string | null;
}

export interface Interaction {
  id: string;
  deal_id: string;
  external_id: string | null;
  type: 'call' | 'email';
  title: string | null;
  timestamp: string;
  duration: number | null;
  participants: Participant[] | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Participant {
  name: string;
  title?: string;
  affiliation?: string;
}

export interface ManualEmail {
  id: string;
  deal_id: string;
  subject: string | null;
  from_email: string | null;
  to_email: string | null;
  timestamp: string;
  import_batch_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Analysis {
  id: string;
  deal_id: string;
  analysis_type: string;
  exec_summary: string | null;
  next_steps: string | null;
  details: AnalysisDetails | null;
  structured_data: Record<string, unknown> | null;
  slack_thread_ts: string | null;
  slack_channel: string | null;
  created_at: string;
}

export interface AnalysisDetails {
  fullText?: string;
  sections?: Record<string, string>;
}

export interface DealDetail extends Deal {
  interactions: Interaction[];
  manual_emails: ManualEmail[];
  latest_analysis: Analysis | null;
  all_analyses: Analysis[];
}

export interface DealFilters {
  stage?: string;
  team?: string;
  owner_email?: string;
  contact_email?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface DealsResponse {
  deals: Deal[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StatsResponse {
  total_deals: number;
  analyzed_deals: number;
  unanalyzed_deals: number;
  deals_by_stage: { stage: string; count: number }[];
  recent_activity: RecentActivity[];
}

export interface RecentActivity {
  deal_id: string;
  deal_name: string;
  account_name: string | null;
  stage: string | null;
  activity_type: 'call' | 'email' | 'analysis';
  activity_at: string;
}

export interface FilterOptions {
  stages: string[];
  teams: string[];
  owners: { name: string; email: string }[];
  dealNames: string[];
}

export interface TranscriptRow {
  // interaction fields
  id: string;
  external_id: string | null;
  title: string | null;
  timestamp: string;
  duration: number | null;
  participants: Participant[] | null;
  // deal fields
  deal_id: string;
  deal_name: string;
  stage: string | null;
  crm_id: string | null;
  // latest analysis for the deal (may be null)
  analysis_id: string | null;
  analysis_type: string | null;
  exec_summary: string | null;
  next_steps: string | null;
  details: AnalysisDetails | null;
  slack_thread_ts: string | null;
  slack_channel: string | null;
  analysis_at: string | null;
}

export interface DealQueryFilters {
  owner?: string;      // single owner ILIKE (individual view)
  owners?: string[];   // exact match on multiple owners (team view)
  dealName?: string;
  stage?: string;
  from?: string;
  to?: string;
}

export interface DealQueryRow {
  deal_id: string;
  deal_name: string;
  stage: string | null;
  crm_id: string | null;
  transcript_count: number;
  latest_timestamp: string | null;
  exec_summary: string | null;
  analysis_type: string | null;
}

export interface CsvRow {
  crm_id: string;
  company_name?: string;
  deal_name?: string;
  deal_stage?: string;
  team?: string;
  owner_name?: string;
  owner_email?: string;
  [key: string]: string | undefined;
}
