import { createHmac } from 'crypto';

/**
 * Gong webhook utilities
 */

export interface GongWebhookPayload {
  eventType: string;
  callId: string;
  timestamp: string;
  crmOpportunityIds?: string[];
  metadata?: any;
}

/**
 * Verify Gong webhook signature
 * @param payload - Raw request body
 * @param signature - Signature from headers
 * @param secret - Webhook secret
 * @returns true if valid
 */
export function verifyGongWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const computed = hmac.digest('hex');
  
  return computed === signature;
}

/**
 * Parse Gong webhook payload
 * @param body - Request body
 * @returns Parsed payload
 */
export function parseGongWebhook(body: any): GongWebhookPayload {
  // Gong webhook structure (may need adjustment based on actual payload)
  return {
    eventType: body.eventType || body.event_type,
    callId: body.callId || body.call_id || body.id,
    timestamp: body.timestamp || body.occurred_at || new Date().toISOString(),
    crmOpportunityIds: body.crmOpportunityIds || body.crm_opportunity_ids || [],
    metadata: body,
  };
}

/**
 * Extract CRM IDs from Gong webhook
 * Gong can link calls to multiple CRM opportunities
 */
export function extractCrmIds(payload: GongWebhookPayload): string[] {
  if (payload.crmOpportunityIds && payload.crmOpportunityIds.length > 0) {
    return payload.crmOpportunityIds;
  }
  
  // Fallback: check metadata for CRM references
  if (payload.metadata) {
    const { metadata } = payload;
    if (metadata.opportunities) return metadata.opportunities;
    if (metadata.deals) return metadata.deals;
  }
  
  return [];
}

