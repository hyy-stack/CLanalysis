import { NextRequest, NextResponse } from 'next/server';
import { GongClient } from '@/lib/gong/client';
import { parseGongWebhook, extractCrmIds, verifyGongWebhookJWT } from '@/lib/gong/webhook';
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
    
    // Extract CRM opportunity IDs
    const crmIds = extractCrmIds(payload);
    
    if (crmIds.length === 0) {
      console.log(`[Gong Webhook] No CRM IDs found for call ${callId}`);
      // Still process the call, but with null deal_id
    }
    
    // Fetch full call details from Gong API
    const gongClient = new GongClient(
      process.env.GONG_ACCESS_KEY!,
      process.env.GONG_ACCESS_KEY_SECRET!
    );
    
    const callResponse = await gongClient.getCall(callId);
    const call = callResponse.call;
    
    if (!call) {
      console.error(`[Gong Webhook] Call ${callId} not found in Gong`);
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }
    
    // Fetch transcript
    const transcriptResponse = await gongClient.getCallTranscript(
      callId,
      call.started || call.scheduled
    );
    
    const transcript = transcriptResponse.callTranscripts?.[0];
    
    // Upload transcript to Blob storage
    const blobUrl = await uploadTranscript(callId, transcript);
    
    console.log(`[Gong Webhook] Transcript uploaded to Blob: ${blobUrl}`);
    
    // Process each CRM ID (a call can be associated with multiple opportunities)
    const dealIds: string[] = [];
    
    for (const crmId of crmIds) {
      // Upsert deal
      const deal = await upsertDeal(crmId, {
        name: call.title || `Deal ${crmId}`,
        stage: 'active', // Default stage, will be updated by CRM sync
        accountName: call.title,
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
          participants: call.parties || [],
          source: 'gong_webhook',
        }
      );
      
      console.log(`[Gong Webhook] Interaction created for deal ${deal.id}`);
      
      // Auto-trigger analysis after every 3 interactions
      try {
        const interactions = await (await import('@/lib/db/client')).getInteractionsForDeal(deal.id);
        const manualEmails = await (await import('@/lib/db/client')).getManualEmailsForDeal(deal.id);
        const totalInteractions = interactions.length + manualEmails.length;
        
        console.log(`[Gong Webhook] Deal ${deal.id} now has ${totalInteractions} total interactions`);
        
        // Trigger analysis every 3 interactions (3, 6, 9, etc.)
        if (totalInteractions % 3 === 0 && totalInteractions > 0) {
          console.log(`[Gong Webhook] Auto-triggering analysis (${totalInteractions} interactions)`);
          
          // Trigger async - don't wait for completion
          fetch(`https://anrok-deal-analyzer.vercel.app/api/analyze-deal`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Call': 'internal', // Mark as internal call to bypass API key
            },
            body: JSON.stringify({ dealId: deal.id }),
          }).catch(err => {
            console.error(`[Gong Webhook] Auto-analysis failed for ${deal.id}:`, err);
          });
        }
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
          participants: call.parties || [],
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

