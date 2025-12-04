/**
 * Common types used across the application
 */

export interface Participant {
  id: string;
  name: string;
  email?: string;
  role: 'customer' | 'sales' | 'other';
  company?: string;
}

export interface Deal {
  id: string;
  name: string;
  stage: string;
  closedDate?: string;
  lostReason?: string;
  participants: Participant[];
  accountName?: string;
  value?: number;
  currency?: string;
  createdDate?: string;
  metadata?: Record<string, unknown>;
}

export interface Call {
  id: string;
  dealId: string;
  title?: string;
  date: string;
  duration: number; // in seconds
  participants: Participant[];
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface TranscriptTurn {
  speaker: string;
  speakerId?: string;
  speakerRole: 'customer' | 'sales' | 'other';
  timestamp: number; // seconds from start of call
  text: string;
}

export interface Transcript {
  callId: string;
  turns: TranscriptTurn[];
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface DealFilter {
  stages?: string[];
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export interface SyncMetadata {
  lastSyncDate: string;
  dealsSynced: number;
  callsSynced: number;
  transcriptsSynced: number;
}

export interface AnalysisResult {
  dealId: string;
  dealName: string;
  analysisDate: string;
  insights: {
    turningPoints: TurningPoint[];
    customerSentiment: SentimentTimeline[];
    realObjections: string[];
    statedReasons: string[];
    recommendations: string[];
  };
  summary: string;
}

export interface TurningPoint {
  callId: string;
  callDate: string;
  timestamp: number;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  customerQuote?: string;
  salesQuote?: string;
}

export interface SentimentTimeline {
  callId: string;
  callDate: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  indicators: string[];
}



