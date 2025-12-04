/**
 * API request/response types
 */

export interface GongWebhookRequest {
  eventType: string;
  callId: string;
  timestamp: string;
  crmOpportunityIds?: string[];
  metadata?: any;
}

export interface EmailImportRequest {
  emails: EmailImportItem[];
  triggerAnalysis?: boolean;
}

export interface EmailImportItem {
  crmId: string;
  subject: string;
  from: string;
  to: string;
  timestamp: string;
  body: string;
}

export interface AnalyzeRequest {
  crmId?: string;
  dealId?: string;
  analysisType?: 'primary' | 'customer_sentiment';
}

export interface AnalyzeResponse {
  success: boolean;
  dealId?: string;
  dealName?: string;
  analysisId?: string;
  slackThread?: string;
  summary?: {
    interactions: number;
    emails: number;
    execSummary: string;
  };
  error?: string;
}

export interface SlackPostRequest {
  dealId: string;
  analysisId?: string;
}

