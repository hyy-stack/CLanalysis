import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey, isAuthError } from '@/lib/auth/api-key';
import { GongClient } from '@/lib/gong/client';
import { uploadTranscript } from '@/lib/blob/storage';
import { upsertDeal, createInteraction, interactionExists } from '@/lib/db/client';

/**
 * Backfill Deal API
 * POST /api/backfill-deal
 * 
 * Imports historical Gong calls for a CRM opportunity
 * Requires API key authentication
 */

const BackfillRequestSchema = z.object({
  crmId: z.string().min(1),
  callIds: z.array(z.string()).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  autoAnalyze: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    // Require API key
    const authResult = await requireApiKey(request);
    if (isAuthError(authResult)) return authResult;
    
    const body = await request.json();
    const { crmId, callIds, fromDate, toDate, autoAnalyze } = BackfillRequestSchema.parse(body);
    
    console.log(`[Backfill] Starting backfill for CRM ID: ${crmId}`);
    
    const gongClient = new GongClient(
      process.env.GONG_ACCESS_KEY!,
      process.env.GONG_ACCESS_KEY_SECRET!
    );
    
    const results = {
      callsImported: 0,
      callsFailed: 0,
      errors: [] as string[],
      dealId: '',
      dealName: '',
      analysisTriggered: false,
    };
    
    let gongCalls: any[] = [];
    
    // Approach 1: Try CRM filtering (if no explicit call IDs provided)
    if (!callIds || callIds.length === 0) {
      console.log('[Backfill] Attempting CRM-based call discovery...');
      
      try {
        // Try to fetch calls by CRM ID using extensive endpoint
        const response = await gongClient.listCallsByCrmId(crmId, fromDate, toDate);
        
        if (response && response.length > 0) {
          console.log(`[Backfill] ✓ CRM filtering worked: Found ${response.length} calls`);
          gongCalls = response;
        } else {
          console.log('[Backfill] CRM filtering returned no calls');
        }
      } catch (error) {
        console.log('[Backfill] CRM filtering not available:', (error as Error).message);
      }
    }
    
    // Approach 2: Fallback to manual call IDs
    if (gongCalls.length === 0 && callIds && callIds.length > 0) {
      console.log(`[Backfill] Using ${callIds.length} provided call IDs`);
      
      for (const callId of callIds) {
        try {
          const callResponse = await gongClient.getCall(callId);
          const call = callResponse.call || callResponse;
          
          if (call && call.id) {
            gongCalls.push(call);
          }
        } catch (error) {
          results.callsFailed++;
          results.errors.push(`Call ${callId}: ${(error as Error).message}`);
          console.error(`[Backfill] Failed to fetch call ${callId}:`, error);
        }
      }
      
      console.log(`[Backfill] Fetched ${gongCalls.length}/${callIds.length} calls`);
    }
    
    // Approach 3: If both failed
    if (gongCalls.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No calls found',
        message: 'CRM filtering not available and no call IDs provided',
        hint: 'Please provide callIds array with specific call IDs from Gong',
        suggestion: 'Use local MVP tool: npm run sync -- --company-name "Company"',
      }, { status: 400 });
    }
    
    // Process calls and store in database
    console.log(`[Backfill] Processing ${gongCalls.length} calls...`);
    
    // Ensure deal exists
    const deal = await upsertDeal(crmId, {
      name: gongCalls[0]?.title || `Deal ${crmId}`,
      stage: 'active',
      accountName: gongCalls[0]?.title,
    });
    
    results.dealId = deal.id;
    results.dealName = deal.name;
    
    console.log(`[Backfill] Deal: ${deal.name} (${deal.id})`);
    
    // Process each call
    for (let i = 0; i < gongCalls.length; i++) {
      const call = gongCalls[i];
      
      try {
        // Check if already imported (idempotency)
        const exists = await interactionExists(call.id);
        if (exists) {
          console.log(`[Backfill] [${i + 1}/${gongCalls.length}] Call ${call.id} already exists, skipping`);
          continue;
        }
        
        console.log(`[Backfill] [${i + 1}/${gongCalls.length}] Processing call ${call.id}...`);
        
        // Fetch transcript
        const transcriptResponse = await gongClient.getCallTranscript(
          call.id,
          call.started || call.scheduled
        );
        
        const gongTranscript = transcriptResponse.callTranscripts?.[0];
        
        // Parse Gong transcript into our format
        const transcript = parseGongTranscript(gongTranscript, call.id);
        
        console.log(`[Backfill] Parsed ${transcript.turns.length} turns`);
        
        // Upload to Blob
        const blobUrl = await uploadTranscript(call.id, transcript);
        
        console.log(`[Backfill] Transcript uploaded to Blob`);
        
        // Create interaction record
        await createInteraction(
          deal.id,
          'call',
          call.id,
          blobUrl,
          {
            title: call.title,
            timestamp: call.started || call.scheduled || new Date().toISOString(),
            duration: call.duration,
            participants: call.parties || [],
            source: 'gong_api', // Mark as backfilled (not from webhook)
          }
        );
        
        results.callsImported++;
        console.log(`[Backfill] ✓ Call ${call.id} imported`);
        
      } catch (error) {
        results.callsFailed++;
        results.errors.push(`Call ${call.id}: ${(error as Error).message}`);
        console.error(`[Backfill] Failed to process call ${call.id}:`, error);
      }
    }
    
    console.log(`[Backfill] Complete: ${results.callsImported} imported, ${results.callsFailed} failed`);
    
    // Trigger analysis if requested and calls were imported
    if (autoAnalyze && results.callsImported > 0) {
      console.log('[Backfill] Triggering analysis...');
      
      try {
        // Trigger async
        fetch(`https://anrok-deal-analyzer.vercel.app/api/analyze-deal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Call': 'internal',
          },
          body: JSON.stringify({ dealId: deal.id }),
        }).catch(err => {
          console.error('[Backfill] Analysis trigger failed:', err);
        });
        
        results.analysisTriggered = true;
      } catch (error) {
        console.error('[Backfill] Failed to trigger analysis:', error);
      }
    }
    
    return NextResponse.json({
      success: true,
      ...results,
    });
    
  } catch (error) {
    console.error('[Backfill] Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
    }, { status: 500 });
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
        speakerRole: 'other', // Role detection would need participant data
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

