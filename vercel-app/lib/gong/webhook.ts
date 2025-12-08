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
 * Check if a stage should be excluded from analysis
 * Customize this list based on your Salesforce stage names
 * NOTE: Renewal and Expansion are INCLUDED (we want to analyze those!)
 */
export function isWonOrPostSalesStage(stage: string): boolean {
  const excludedStages = [
    // Skip closed won deals
    'Closed Won',
    'Closed - Won',
    'Won',
    // Skip post-sales stages
    'Onboarding',
    'Live',
    'Active Customer',
    'Customer Success',
    'Implementation',
    'Deployed',
    // NOTE: 'Renewal' and 'Expansion' are INCLUDED - we analyze those!
  ];
  
  // Case-insensitive check
  const stageLower = stage.toLowerCase();
  return excludedStages.some(excluded => stageLower.includes(excluded.toLowerCase()));
}

/**
 * Check if ALL internal participants are onboarding managers
 * Indicates it's an onboarding/CS call, not a sales call
 */
export function isOnlyOnboardingManager(parties: any[]): boolean {
  const internalParties = parties.filter((p: any) => p.affiliation === 'Internal');
  
  // If no internal parties, don't skip
  if (internalParties.length === 0) {
    return false;
  }
  
  // Check if ALL internal participants are onboarding managers
  const allOnboarding = internalParties.every((party: any) => {
    const title = (party.title || '').toLowerCase();
    return title.includes('onboarding') && title.includes('manager');
  });
  
  return allOnboarding;
}

/**
 * Extract company name from webhook context
 */
export function extractCompanyName(payload: GongWebhookPayload): string | null {
  if (!payload.metadata?.callData?.context) {
    return null;
  }
  
  const contexts = payload.metadata.callData.context;
  if (!Array.isArray(contexts)) return null;
  
  for (const ctx of contexts) {
    if (!ctx.objects || !Array.isArray(ctx.objects)) continue;
    
    for (const obj of ctx.objects) {
      if (obj.objectType === 'Account' && obj.fields) {
        const nameField = obj.fields.find((f: any) => f.name === 'Name');
        if (nameField && nameField.value) {
          return nameField.value;
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract opportunity record type from webhook context
 */
export function extractOpportunityRecordType(payload: GongWebhookPayload): string | null {
  if (!payload.metadata?.callData?.context) {
    return null;
  }
  
  const contexts = payload.metadata.callData.context;
  if (!Array.isArray(contexts)) return null;
  
  for (const ctx of contexts) {
    if (!ctx.objects || !Array.isArray(ctx.objects)) continue;
    
    for (const obj of ctx.objects) {
      if (obj.objectType === 'Opportunity' && obj.fields) {
        const recordTypeField = obj.fields.find((f: any) => f.name === 'RecordTypeId');
        const typeField = obj.fields.find((f: any) => f.name === 'Type');
        
        // Return Type field (New Business, Renewal, etc.) if available
        if (typeField && typeField.value) {
          return typeField.value;
        }
        
        // Fallback to RecordTypeId
        if (recordTypeField && recordTypeField.value) {
          return recordTypeField.value;
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract deal owner (AE/AM name) from webhook context
 * Tries Opportunity Owner_Role_Stamped__c field first, then primary internal participant
 */
export function extractDealOwner(payload: GongWebhookPayload): string | null {
  // First try: Get from Opportunity Owner_Role_Stamped__c field
  if (payload.metadata?.callData?.context) {
    const contexts = payload.metadata.callData.context;
    if (Array.isArray(contexts)) {
      for (const ctx of contexts) {
        if (!ctx.objects || !Array.isArray(ctx.objects)) continue;
        
        for (const obj of ctx.objects) {
          if (obj.objectType === 'Opportunity' && obj.fields) {
            // Try Owner_Role_Stamped__c first (e.g., "MM AE", "Account Manager")
            const ownerRoleField = obj.fields.find((f: any) => f.name === 'Owner_Role_Stamped__c');
            if (ownerRoleField && ownerRoleField.value) {
              // This gives us the role, but we want the name
              // Let's try to get the actual owner name from User object
              const ownerIdField = obj.fields.find((f: any) => f.name === 'OwnerId');
              if (ownerIdField && ownerIdField.value) {
                // Look for User object with matching ID
                for (const ctx2 of contexts) {
                  if (!ctx2.objects || !Array.isArray(ctx2.objects)) continue;
                  for (const obj2 of ctx2.objects) {
                    if (obj2.objectType === 'User' && obj2.objectId === ownerIdField.value && obj2.fields) {
                      const nameField = obj2.fields.find((f: any) => f.name === 'Name');
                      if (nameField && nameField.value) {
                        return nameField.value;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  // Second try: Get primary internal participant from parties
  if (payload.metadata?.callData?.parties) {
    const parties = payload.metadata.callData.parties;
    if (Array.isArray(parties)) {
      // Find the primary user (has userId) or first internal participant
      const primaryUser = parties.find((p: any) => p.affiliation === 'Internal' && p.userId);
      if (primaryUser && primaryUser.name) {
        return primaryUser.name;
      }
      
      // Fallback to first internal participant
      const firstInternal = parties.find((p: any) => p.affiliation === 'Internal');
      if (firstInternal && firstInternal.name) {
        return firstInternal.name;
      }
    }
  }
  
  return null;
}

