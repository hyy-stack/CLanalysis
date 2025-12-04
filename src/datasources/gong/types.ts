/**
 * Gong-specific types
 * These mirror the Gong API response structure
 */

export interface GongCall {
  id: string;
  url?: string;
  title?: string;
  scheduled?: string;
  started?: string;
  duration?: number;
  primaryUserId?: string;
  direction?: string;
  system?: string;
  scope?: string;
  media?: string;
  language?: string;
  workspaceId?: string;
  parties?: GongParty[];
  content?: {
    trackers?: unknown[];
    topics?: unknown[];
    pointsOfInterest?: unknown[];
  };
}

export interface GongParty {
  id?: string;
  emailAddress?: string;
  name?: string;
  title?: string;
  userId?: string;
  speakerId?: string;
  context?: string[];
  affiliation?: 'internal' | 'external' | 'unknown';
  methods?: string[];
}

export interface GongTranscript {
  callId: string;
  transcript?: {
    sentences?: GongSentence[];
  };
}

export interface GongSentence {
  start?: number;
  end?: number;
  speakerId?: string;
  text?: string;
}

export interface GongCallsResponse {
  records?: {
    totalRecords?: number;
    currentPageSize?: number;
    currentPageNumber?: number;
  };
  calls?: GongCall[];
}

export interface GongTranscriptResponse {
  callTranscripts?: GongTranscript[];
}

// Note: Gong's CRM integration data structure
// This may vary based on your CRM (Salesforce, HubSpot, etc.)
export interface GongCRMDeal {
  id: string;
  name?: string;
  status?: string;
  stage?: string;
  amount?: number;
  currency?: string;
  closeDate?: string;
  createdDate?: string;
  customFields?: Record<string, unknown>;
}



