import jwt from 'jsonwebtoken';

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
    const jwtToken = token.replace(/^Bearer\s+/, '').trim();
    
    // Format public key with proper PEM headers if missing
    let formattedKey = publicKey.trim();
    if (!formattedKey.includes('-----BEGIN')) {
      formattedKey = `-----BEGIN PUBLIC KEY-----\n${formattedKey}\n-----END PUBLIC KEY-----`;
    }
    
    // Verify JWT
    jwt.verify(jwtToken, formattedKey, {
      algorithms: ['RS256'],
    });
    
    return true;
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
  // Gong webhook has nested structure: callData.metaData for call info
  const callData = body.callData || body;
  const metaData = callData.metaData || callData;
  
  // Extract call ID from nested structure
  const callId = metaData.id || body.callId || body.call_id;
  
  // Extract CRM opportunity IDs from context
  const crmOpportunityIds: string[] = [];
  if (callData.context && Array.isArray(callData.context)) {
    for (const ctx of callData.context) {
      if (ctx.objects && Array.isArray(ctx.objects)) {
        for (const obj of ctx.objects) {
          if (obj.objectType === 'Opportunity' && obj.objectId) {
            crmOpportunityIds.push(obj.objectId);
          }
        }
      }
    }
  }
  
  return {
    eventType: body.eventType || 'call.processed',
    callId,
    timestamp: metaData.started || metaData.scheduled || new Date().toISOString(),
    crmOpportunityIds,
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

/**
 * Extract deal stages from webhook payload
 * Returns array of stage names for all linked opportunities
 */
export function extractDealStages(payload: GongWebhookPayload): string[] {
  const stages: string[] = [];
  
  if (!payload.metadata?.callData?.context) {
    return stages;
  }
  
  // Look through context for Salesforce opportunities
  const contexts = payload.metadata.callData.context;
  if (!Array.isArray(contexts)) return stages;
  
  for (const ctx of contexts) {
    if (!ctx.objects || !Array.isArray(ctx.objects)) continue;
    
    for (const obj of ctx.objects) {
      if (obj.objectType === 'Opportunity' && obj.fields) {
        // Find StageName field
        const stageField = obj.fields.find((f: any) => f.name === 'StageName');
        if (stageField && stageField.value) {
          stages.push(stageField.value);
        }
      }
    }
  }
  
  return stages;
}

/**
 * Check if a stage is post-sales (after deal is won)
 * Customize this list based on your Salesforce stage names
 * NOTE: Renewal and Expansion are INCLUDED for analysis (not post-sales)
 */
export function isWonOrPostSalesStage(stage: string): boolean {
  const postSalesStages = [
    // Only skip these post-win stages
    'Onboarding',
    'Live',
    'Active Customer',
    'Customer Success',
    'Implementation',
    'Deployed',
    // NOTE: 'Closed Won', 'Renewal', 'Expansion' removed - we analyze those!
  ];
  
  // Case-insensitive check
  const stageLower = stage.toLowerCase();
  return postSalesStages.some(ps => stageLower.includes(ps.toLowerCase()));
}

