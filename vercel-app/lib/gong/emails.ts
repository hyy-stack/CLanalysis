import { GongClient } from './client';
import { uploadEmail } from '@/lib/blob/storage';
import { createInteraction } from '@/lib/db/client';

/**
 * Email enrichment utilities
 * Fetches emails for participants and associates with deals
 */

/**
 * Enrich a deal with emails from external participants
 * Runs asynchronously after webhook processing
 */
export async function enrichDealWithEmails(
  dealId: string,
  callId: string,
  externalParties: any[],
  gongClient: GongClient
): Promise<void> {
  console.log(`[Email Enrichment] Starting for deal ${dealId} with ${externalParties.length} external parties`);
  
  for (const party of externalParties) {
    if (!party.emailAddress) {
      console.log(`[Email Enrichment] Skipping party without email: ${party.name}`);
      continue;
    }
    
    try {
      console.log(`[Email Enrichment] Fetching emails for ${party.emailAddress}`);
      
      // Fetch email data for this participant
      const emailData = await gongClient.getEmailsForAddress(party.emailAddress);
      
      if (!emailData || !emailData.contentUrl) {
        console.log(`[Email Enrichment] No content URL for ${party.emailAddress}`);
        continue;
      }
      
      // Fetch the actual email content from contentUrl
      const contentResponse = await fetch(emailData.contentUrl);
      if (!contentResponse.ok) {
        console.error(`[Email Enrichment] Failed to fetch content: ${contentResponse.status}`);
        continue;
      }
      
      const content = await contentResponse.json();
      
      // Parse emails from content
      const emails = extractEmailsFromContent(content);
      console.log(`[Email Enrichment] Found ${emails.length} emails for ${party.emailAddress}`);
      
      // Store each email as an interaction
      for (const email of emails) {
        try {
          // Upload email body to Blob
          const emailId = `${callId}-${party.emailAddress}-${email.timestamp}`;
          const blobUrl = await uploadEmail(emailId, email.body || email.content || '');
          
          // Create interaction record
          await createInteraction(
            dealId,
            'email',
            emailId,
            blobUrl,
            {
              title: email.subject,
              timestamp: email.timestamp || new Date().toISOString(),
              participants: [{ 
                email: party.emailAddress, 
                name: party.name,
                role: 'customer',
              }],
              source: 'gong_api',
            }
          );
          
          console.log(`[Email Enrichment] ✓ Stored email: ${email.subject}`);
        } catch (error) {
          console.error(`[Email Enrichment] Failed to store email:`, error);
        }
      }
      
    } catch (error) {
      console.error(`[Email Enrichment] Error processing ${party.emailAddress}:`, error);
    }
  }
  
  console.log(`[Email Enrichment] Complete for deal ${dealId}`);
}

/**
 * Extract email messages from Gong's data privacy response
 * The structure may vary - adjust based on actual response
 */
function extractEmailsFromContent(content: any): any[] {
  const emails: any[] = [];
  
  // Gong's data structure may have emails in various formats
  // Adjust this based on what the contentUrl actually returns
  
  if (content.emails && Array.isArray(content.emails)) {
    return content.emails;
  }
  
  if (content.messages && Array.isArray(content.messages)) {
    return content.messages;
  }
  
  if (content.emailMessages && Array.isArray(content.emailMessages)) {
    return content.emailMessages;
  }
  
  // If it's an array at the top level
  if (Array.isArray(content)) {
    return content;
  }
  
  console.log('[Email Enrichment] Unknown content structure:', Object.keys(content));
  return [];
}

