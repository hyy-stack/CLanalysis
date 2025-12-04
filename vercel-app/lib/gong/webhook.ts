import { createPublicKey, verify } from 'crypto';

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
 * Verify Gong webhook JWT signature
 * Gong signs webhooks with JWT using their private key
 * @param token - JWT token from Authorization header
 * @param publicKey - Gong's public key (from webhook config)
 * @returns true if valid
 */
export function verifyGongWebhookJWT(
  token: string,
  publicKey: string
): boolean {
  try {
    // Remove "Bearer " prefix if present
    const jwtToken = token.replace(/^Bearer\s+/, '');
    
    // Split JWT into parts
    const parts = jwtToken.split('.');
    if (parts.length !== 3) {
      return false;
    }
    
    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Verify signature
    const signedData = `${headerB64}.${payloadB64}`;
    const signature = Buffer.from(signatureB64, 'base64url');
    
    // Create public key object
    const key = createPublicKey({
      key: publicKey,
      format: 'pem',
    });
    
    // Verify with RSA
    const isValid = verify(
      'RSA-SHA256',
      Buffer.from(signedData),
      key,
      signature
    );
    
    return isValid;
  } catch (error) {
    console.error('[Gong] JWT verification error:', error);
    return false;
  }
}

/**
 * Legacy HMAC verification (for backwards compatibility)
 * @deprecated Use verifyGongWebhookJWT instead
 */
export function verifyGongWebhookHMAC(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const { createHmac } = require('crypto');
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

