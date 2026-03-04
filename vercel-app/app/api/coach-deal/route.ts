import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey, isAuthError } from '@/lib/auth/api-key';
import {
  getDealByCrmId,
  getDealById,
  getInteractionsForDeal,
  createAnalysis,
  getLatestComEnhancedAnalysis,
} from '@/lib/db/client';
import type { ComEnhancedStructuredData } from '@/types/database';
import { retrieveTranscript } from '@/lib/blob/storage';
import { createSalesforceClient } from '@/lib/salesforce/client';
import { SlackClient } from '@/lib/slack/client';
import { formatDealInfo } from '@/lib/analysis/builder';
import {
  detectFieldGaps,
  assessMantraQuality,
  formatStageContext,
} from '@/lib/coaching/stage-framework';
import { runStage1, runStage2, formatTranscriptForCoaching } from '@/lib/coaching/pipeline';
import { ClaudeClient } from '@/lib/claude/client';

/**
 * CoM Coaching API
 * POST /api/coach-deal
 *
 * Runs the two-stage CoM coaching pipeline for the most recent call on a deal:
 *   Stage 1: com-discovery-coaching.md — full coaching output
 *   Stage 2: com-rep-digest.md — Slack-ready digest + bot feedback
 *
 * Stores both in the analyses table and posts the digest to #coaching-analysis.
 * Supports re-runs for the same deal (each run creates new rows).
 *
 * Requires API key authentication.
 */

const CoachRequestSchema = z.object({
  crmId: z.string().optional(),
  dealId: z.string().uuid().optional(),
}).refine(data => data.crmId || data.dealId, {
  message: 'Either crmId or dealId must be provided',
});

export async function POST(request: NextRequest) {
  try {
    console.log('[Coaching] Request received');

    const authResult = await requireApiKey(request);
    if (isAuthError(authResult)) {
      return authResult;
    }

    const body = await request.json();
    const { crmId, dealId } = CoachRequestSchema.parse(body);

    console.log('[Coaching] Starting coaching for:', crmId || dealId);

    // ── Fetch deal ────────────────────────────────────────────────────────────
    const deal = crmId
      ? await getDealByCrmId(crmId)
      : await getDealById(dealId!);

    if (!deal) {
      return NextResponse.json({ success: false, error: 'Deal not found' }, { status: 404 });
    }

    console.log(`[Coaching] Deal: ${deal.name} (${deal.stage})`);

    // ── Fetch most recent call interaction ────────────────────────────────────
    const allInteractions = await getInteractionsForDeal(deal.id);
    const callInteractions = allInteractions.filter(i => i.type === 'call');

    if (callInteractions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No call interactions found for this deal' },
        { status: 400 }
      );
    }

    // Most recent call last (interactions are sorted chronologically ASC)
    const latestCall = callInteractions[callInteractions.length - 1];
    console.log(`[Coaching] Using call: "${latestCall.title}" (${latestCall.timestamp})`);

    // ── Fetch and format transcript ───────────────────────────────────────────
    const rawTranscript = await retrieveTranscript(latestCall.blob_url);
    const transcriptText = formatTranscriptForCoaching(rawTranscript);

    if (!transcriptText || transcriptText === '*No transcript available*') {
      return NextResponse.json(
        { success: false, error: 'Transcript is empty or unavailable' },
        { status: 400 }
      );
    }

    console.log(`[Coaching] Transcript: ${transcriptText.length} chars`);

    // ── Fetch CoM fields from Salesforce ──────────────────────────────────────
    const salesforceClient = createSalesforceClient();
    let comFields = null;

    if (salesforceClient && deal.crm_id) {
      comFields = await salesforceClient.getCoMFields(deal.crm_id);
      if (comFields) {
        console.log(`[Coaching] SF StageName: ${comFields.stageName}`);
      } else {
        console.warn('[Coaching] Salesforce CoM fields unavailable — proceeding without them');
      }
    } else {
      console.warn('[Coaching] Salesforce client not configured — proceeding without SF fields');
    }

    // ── Stage-aware context assembly ──────────────────────────────────────────
    const sfStageName = comFields?.stageName || null;
    const fieldGaps = comFields ? detectFieldGaps(comFields, sfStageName) : [];
    const mantraAssessment = assessMantraQuality(comFields?.mantra || null, sfStageName);
    const stageContext = formatStageContext(sfStageName, fieldGaps, mantraAssessment);

    console.log(`[Coaching] Stage context built — ${fieldGaps.length} field gap(s) detected`);

    // ── Build deal info string ────────────────────────────────────────────────
    const dealInfo = formatDealInfo(deal);
    const repName = deal.owner_name || null;
    const sfInstanceUrl = process.env.SALESFORCE_INSTANCE_URL || 'https://anrok.lightning.force.com';
    const sfOpportunityUrl = deal.crm_id ? `${sfInstanceUrl}/${deal.crm_id}` : null;

    // ── Resolve buyer scenario from prior com_enhanced analysis ───────────────
    let buyerScenario = 'Unknown';

    try {
      const comEnhanced = await getLatestComEnhancedAnalysis(deal.id);
      if (comEnhanced?.structured_data) {
        const sd = comEnhanced.structured_data as ComEnhancedStructuredData;
        if (sd.buyerScenario && sd.buyerScenario !== 'Unknown') {
          buyerScenario = sd.buyerScenario;
          console.log(`[Coaching] Buyer scenario resolved from com_enhanced: ${buyerScenario}`);
        } else {
          console.log('[Coaching] com_enhanced found but buyerScenario is Unknown — using Unknown');
        }
      } else {
        console.log('[Coaching] No prior com_enhanced analysis — buyer scenario Unknown');
      }
    } catch (scenarioError) {
      console.warn('[Coaching] Failed to resolve buyer scenario (non-fatal):', scenarioError);
    }

    // ── Stage 1: Discovery coaching ───────────────────────────────────────────
    console.log('[Coaching] Running Stage 1...');
    const claudeClient = new ClaudeClient(process.env.ANTHROPIC_API_KEY!);
    const stage1 = await runStage1(transcriptText, dealInfo, stageContext, repName, claudeClient, buyerScenario);

    const stage1Structured = {
      interaction_id: latestCall.id,
      stage: sfStageName || 'Unknown',
      stageContext,
      fieldGaps,
      mantraAssessment,
      buyerScenario,
    };

    const stage1Row = await createAnalysis(deal.id, 'coaching_stage1', {
      execSummary: `CoM coaching: ${latestCall.title || latestCall.id}`,
      nextSteps: '',
      details: { fullText: stage1.coachingOutput },
      structuredData: stage1Structured,
    });

    console.log(`[Coaching] Stage 1 stored: ${stage1Row.id}`);

    // ── Stage 2: Rep digest ───────────────────────────────────────────────────
    console.log('[Coaching] Running Stage 2...');
    let stage2Row;
    let slackTs: string | undefined;

    try {
      const stage2 = await runStage2(transcriptText, stage1.coachingOutput, repName, claudeClient, buyerScenario);

      const stage2Structured = {
        interaction_id: latestCall.id,
        slackDigest: stage2.slackDigest,
        botFeedback: stage2.botFeedback,
      };

      // ── Post to Slack ─────────────────────────────────────────────────────
      const coachingChannelId = process.env.SLACK_COACHING_CHANNEL_ID;
      if (coachingChannelId && process.env.SLACK_BOT_TOKEN) {
        try {
          const slackClient = new SlackClient(
            process.env.SLACK_BOT_TOKEN,
            coachingChannelId
          );
          slackTs = await slackClient.postCoachingDigest(
            deal.name,
            repName,
            latestCall.title || null,
            new Date(latestCall.timestamp),
            stage2.slackDigest,
            sfStageName,
            sfOpportunityUrl,
          );
          console.log(`[Coaching] Slack digest posted, thread: ${slackTs}`);
        } catch (slackError) {
          console.error('[Coaching] Slack post failed (non-fatal):', slackError);
        }
      } else {
        console.warn('[Coaching] SLACK_COACHING_CHANNEL_ID or SLACK_BOT_TOKEN not configured — skipping Slack post');
      }

      stage2Row = await createAnalysis(deal.id, 'coaching_digest', {
        execSummary: stage2.slackDigest,
        nextSteps: '',
        details: { fullText: stage2.fullResponse },
        structuredData: stage2Structured,
        slackThreadTs: slackTs,
        slackChannel: coachingChannelId,
      });

      console.log(`[Coaching] Stage 2 stored: ${stage2Row.id}`);
    } catch (stage2Error) {
      // Stage 2 failure: keep Stage 1 row, return partial success
      console.error('[Coaching] Stage 2 failed — Stage 1 result preserved:', stage2Error);
      return NextResponse.json({
        success: false,
        stage1Id: stage1Row.id,
        error: 'stage2_failed',
        message: (stage2Error as Error).message,
      }, { status: 207 }); // 207 Multi-Status: partial success
    }

    return NextResponse.json({
      success: true,
      dealId: deal.id,
      dealName: deal.name,
      stage1Id: stage1Row.id,
      stage2Id: stage2Row.id,
      slackTs,
      interactionId: latestCall.id,
      callTitle: latestCall.title,
      sfStage: sfStageName,
      fieldGapsDetected: fieldGaps.length,
    });

  } catch (error) {
    console.error('[Coaching] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
