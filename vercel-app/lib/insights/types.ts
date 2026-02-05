/**
 * Types for customer insights analysis
 */

export type InsightType = 'prospect' | 'customer' | 'closed_lost';

export interface ExtractedQuote {
  quote: string;
  context: string;
  dealName: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface ThematicCategory {
  name: string;
  summary: string;
  quotes: { quote: string; dealName: string; context: string }[];
}

export interface CategorizedInsights {
  positiveCategories: ThematicCategory[];
  concernCategories: ThematicCategory[];
  summary: string;
}

export interface InsightsResult {
  success: boolean;
  insights: CategorizedInsights | null;
  stats: {
    days: number;
    transcriptCount: number;
    totalQuotes: number;
  };
  message?: string;
}

export interface TranscriptRow {
  id: string;
  external_id: string;
  title: string;
  timestamp: string;
  blob_url: string;
  participants: any[];
  deal_name: string;
  crm_id: string;
  stage: string;
  account_name: string;
}
