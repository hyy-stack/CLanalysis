import { NextRequest, NextResponse } from 'next/server';
import { GongClient } from '@/lib/gong/client';
import { 
  parseGongWebhook, 
  extractCrmIds, 
  verifyGongWebhookJWT, 
  extractDealStages, 
  isWonOrPostSalesStage,
  isOnlyOnboardingManager,
  extractCompanyName,
  extractOpportunityRecordType,
  extractDealOwner,
} from '@/lib/gong/webhook';
import { uploadTranscript } from '@/lib/blob/storage';
import { upsertDeal, createInteraction, interactionExists } from '@/lib/db/client';

/**
 * Gong Webhook Handler
 * POST /api/gong-webhook
 * 
 * Receives webhooks when Gong processes a call
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);
    
    console.log('[Gong Webhook] Received webhook');
    
    // Log all headers for debugging
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log('[Gong Webhook] Headers:', JSON.stringify(headers, null, 2));
    
    // Verify webhook JWT signature
    const authHeader = request.headers.get('authorization') || 
                      request.headers.get('x-gong-signature') ||
                      request.headers.get('x-gong-authorization') || '';
    
    if (!authHeader) {
      console.error('[Gong Webhook] No authentication header found');
      console.error('[Gong Webhook] Available headers:', Object.keys(headers));
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 });
    }
    
    const gongPublicKey = process.env.GONG_WEBHOOK_PUBLIC_KEY;
    if (!gongPublicKey) {
      console.error('[Gong Webhook] GONG_WEBHOOK_PUBLIC_KEY not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    const isValid = verifyGongWebhookJWT(authHeader, gongPublicKey);
    
    if (!isValid) {
      console.error('[Gong Webhook] Invalid JWT signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    console.log('[Gong Webhook] ✓ JWT signature verified');
    
    // Log the actual payload structure
    console.log('[Gong Webhook] Payload:', JSON.stringify(body, null, 2));
    
    // Parse webhook payload
    const payload = parseGongWebhook(body);
    console.log('[Gong Webhook] Parsed:', JSON.stringify(payload, null, 2));
    const { callId } = payload;
    
    // Check idempotency - if we've already processed this call, return success
    const exists = await interactionExists(callId);
    if (exists) {
      console.log(`[Gong Webhook] Call ${callId} already processed, skipping`);
      return NextResponse.json({ status: 'already_processed', callId });
    }
    
    // Extract CRM opportunity IDs and check deal stages
    const crmIds = extractCrmIds(payload);
    
    // Check if this is a post-sales/won deal we should skip
    const dealStages = extractDealStages(payload);
    const isPostSales = dealStages.some(stage => 
      isWonOrPostSalesStage(stage)
    );
    
    if (isPostSales) {
      console.log(`[Gong Webhook] Skipping post-sales/won deal (stages: ${dealStages.join(', ')})`);
      return NextResponse.json({ 
        status: 'skipped', 
        reason: 'post_sales_deal',
        stages: dealStages 
      });
    }
    
    if (crmIds.length === 0) {
      console.log(`[Gong Webhook] No CRM IDs found for call ${callId}`);
      // Still process the call, but with null deal_id
    }
    
    // Use call data from webhook payload (already has everything we need!)
    const call = body.callData?.metaData;
    const parties = body.callData?.parties || [];
    
    // Check if this is only an onboarding manager call (after parties is defined)
    if (isOnlyOnboardingManager(parties)) {
      console.log(`[Gong Webhook] Skipping onboarding manager call`);
      return NextResponse.json({
        status: 'skipped',
        reason: 'onboarding_call',
      });
    }
    
    if (!call || !call.id) {
      console.error(`[Gong Webhook] Invalid call data in webhook`);
      return NextResponse.json({ error: 'Invalid call data' }, { status: 400 });
    }
    
    console.log(`[Gong Webhook] Call: ${call.title}, Parties: ${parties.length}`);
    
    // Initialize Gong client for transcript fetch
    const gongClient = new GongClient(
      process.env.GONG_ACCESS_KEY!,
      process.env.GONG_ACCESS_KEY_SECRET!
    );
    
    // Fetch transcript
    const transcriptResponse = await gongClient.getCallTranscript(
      callId,
      call.started || call.scheduled
    );
    
    const gongTranscript = transcriptResponse.callTranscripts?.[0];
    
    // Parse Gong transcript into our format with turns
    const transcript = parseGongTranscript(gongTranscript, callId);
    console.log(`[Gong Webhook] Parsed ${transcript.turns.length} conversation turns`);
    
    // Upload transcript to Blob storage
    const blobUrl = await uploadTranscript(callId, transcript);
    
    console.log(`[Gong Webhook] Transcript uploaded to Blob: ${blobUrl}`);
    
    // Extract company name, record type, and owner from payload
    const companyName = extractCompanyName(payload);
    const opportunityRecordType = extractOpportunityRecordType(payload);
    const dealOwner = extractDealOwner(payload);
    
    console.log(`[Gong Webhook] Company: ${companyName}, Record Type: ${opportunityRecordType}, Owner: ${dealOwner || 'N/A'}`);
    
    // Process each CRM ID (a call can be associated with multiple opportunities)
    const dealIds: string[] = [];
    
    for (const crmId of crmIds) {
      // Determine deal stage from webhook
      const stageFromWebhook = dealStages[0] || 'active';
      
      // Upsert deal with company name, record type, and owner
      const deal = await upsertDeal(crmId, {
        name: companyName || call.title || `Deal ${crmId}`,
        stage: stageFromWebhook.toLowerCase().replace(/\s+/g, '_'),
        accountName: companyName || undefined,
        opportunityType: opportunityRecordType || undefined,
        ownerName: dealOwner || undefined,
      });
      
      dealIds.push(deal.id);
      
      // Create interaction record
      await createInteraction(
        deal.id,
        'call',
        callId,
        blobUrl,
        {
          title: call.title,
          timestamp: call.started || call.scheduled || new Date().toISOString(),
          duration: call.duration,
          participants: parties,
          source: 'gong_webhook',
        }
      );
      
      console.log(`[Gong Webhook] Interaction created for deal ${deal.id}`);
      
      // Email enrichment disabled for now (data-privacy endpoint not working as expected)
      // Can be re-enabled once we understand Gong's email API better
      
      // Auto-trigger analysis after EVERY qualifying call
      try {
        const interactions = await (await import('@/lib/db/client')).getInteractionsForDeal(deal.id);
        const manualEmails = await (await import('@/lib/db/client')).getManualEmailsForDeal(deal.id);
        const totalInteractions = interactions.length + manualEmails.length;
        
        console.log(`[Gong Webhook] Deal ${deal.id} now has ${totalInteractions} total interactions`);
        console.log(`[Gong Webhook] Auto-triggering analysis for ${deal.name} (dealId: ${deal.id})`);
        
        // Trigger analysis asynchronously - fire and forget
        const analyzeUrl = `https://anrok-deal-analyzer.vercel.app/api/analyze-deal`;
        
        // Use a longer timeout to ensure request reaches server (analysis itself runs async)
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          console.log(`[Gong Webhook] Fetch timeout (this is OK - analysis continues server-side)`);
          controller.abort();
        }, 30000); // 30 second timeout - enough for request to reach server
        
        fetch(analyzeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Call': 'internal',
          },
          body: JSON.stringify({ dealId: deal.id }),
          signal: controller.signal,
        })
        .then(response => {
          clearTimeout(timeout);
          if (!response.ok) {
            console.error(`[Gong Webhook] Analysis endpoint returned ${response.status}: ${response.statusText}`);
            return response.text().then(text => {
              console.error(`[Gong Webhook] Response body: ${text}`);
            });
          }
          console.log(`[Gong Webhook] ✓ Analysis trigger accepted by server (status ${response.status})`);
        })
        .catch(err => {
          clearTimeout(timeout);
          // Log error but don't fail - analysis may still run server-side
          console.error(`[Gong Webhook] Analysis trigger fetch error: ${err.message}`, err);
        });
      } catch (error) {
        console.error('[Gong Webhook] Failed to check/trigger auto-analysis:', error);
        // Don't fail webhook if auto-analysis fails
      }
    }
    
    if (dealIds.length === 0 && crmIds.length === 0) {
      // No CRM association, create orphaned interaction
      await createInteraction(
        null,
        'call',
        callId,
        blobUrl,
        {
          title: call.title,
          timestamp: call.started || call.scheduled || new Date().toISOString(),
          duration: call.duration,
          participants: parties,
          source: 'gong_webhook',
        }
      );
      
      console.log(`[Gong Webhook] Orphaned call stored (no CRM ID)`);
    }
    
    return NextResponse.json({
      status: 'success',
      callId,
      dealsProcessed: dealIds.length,
      dealIds,
    });
    
  } catch (error) {
    console.error('[Gong Webhook] Error:', error);
    
    // Return 200 even on error to prevent Gong from retrying
    // Log the error for investigation
    return NextResponse.json({
      status: 'error',
      error: (error as Error).message,
    }, { status: 200 });
  }
}

/**
 * Parse Gong transcript structure into our standard format
 * Gong returns transcript as array of topic segments with nested sentences
 */
function parseGongTranscript(gongTranscript: any, callId: string): any {
  const turns: any[] = [];
  
  if (!gongTranscript || !gongTranscript.transcript) {
    return { callId, turns };
  }
  
  // Gong transcript is an array of segments
  const segments = Array.isArray(gongTranscript.transcript)
    ? gongTranscript.transcript
    : Object.values(gongTranscript.transcript);
  
  for (const segment of segments) {
    if (!segment || typeof segment !== 'object') continue;
    
    const speakerId = segment.speakerId || 'Unknown';
    const sentences = segment.sentences || [];
    
    for (const sentence of sentences) {
      if (!sentence || typeof sentence !== 'object') continue;
      
      turns.push({
        speaker: speakerId,
        speakerId: speakerId,
        speakerRole: 'other',
        timestamp: sentence.start || 0,
        text: sentence.text || '',
      });
    }
  }
  
  return {
    callId,
    turns,
    metadata: {
      segmentCount: segments.length,
      turnCount: turns.length,
    },
  };
}

