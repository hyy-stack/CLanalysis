import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/api-key';
import {
  getDealByCrmId,
  getDealById,
  getInteractionsForDeal,
  getManualEmailsForDeal,
  createAnalysis,
  updateDealSalesforceFields,
} from '@/lib/db/client';
import { buildContext, formatDealInfo, loadPrompt, fillPrompt } from '@/lib/analysis/builder';
import { ClaudeClient } from '@/lib/claude/client';
import { SlackClient } from '@/lib/slack/client';
import { createSalesforceClient } from '@/lib/salesforce/client';
import { createGoogleSheetsClient } from '@/lib/google/sheets';
import type { ComEnhancedStructuredData } from '@/types/database';

/**
 * Beta Deal Analysis API - Command of Message Enhanced
 * POST /api/analyze-deal-beta
 *
 * Runs the CoM Enhanced analysis prompt and posts to beta Slack channel
 * Also extracts structured data for Google Sheets
 */

const AnalyzeRequestSchema = z.object({
  crmId: z.string().optional(),
  dealId: z.string().uuid().optional(),
}).refine(data => data.crmId || data.dealId, {
  message: 'Either crmId or dealId must be provided',
});

/**
 * Parse structured JSON from Claude's response
 */
function parseStructuredData(response: string): ComEnhancedStructuredData | null {
  try {
    // Look for JSON block in the response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      console.warn('[Beta Analysis] No JSON block found in response');
      return null;
    }

    const jsonStr = jsonMatch[1].trim();
    const parsed = JSON.parse(jsonStr);

    // Validate required fields exist
    if (typeof parsed.dealHealthScore !== 'number') {
      console.warn('[Beta Analysis] Invalid or missing dealHealthScore');
      return null;
    }

    return parsed as ComEnhancedStructuredData;
  } catch (error) {
    console.error('[Beta Analysis] Failed to parse structured data:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Beta Analysis] Request received');

    // Require API key for this endpoint
    const authError = requireApiKey(request);
    if (authError) {
      console.error('[Beta Analysis] Auth failed:', authError.status);
      return authError;
    }

    const body = await request.json();
    console.log('[Beta Analysis] Request body:', { crmId: body.crmId, dealId: body.dealId });

    const { crmId, dealId } = AnalyzeRequestSchema.parse(body);

    console.log('[Beta Analysis] Starting CoM Enhanced analysis for:', crmId || dealId);

    // Fetch deal
    const deal = crmId
      ? await getDealByCrmId(crmId)
      : await getDealById(dealId!);

    if (!deal) {
      return NextResponse.json({
        success: false,
        error: 'Deal not found',
      }, { status: 404 });
    }

    console.log(`[Beta Analysis] Deal found: ${deal.name} (${deal.stage})`);

    // Fetch latest fields from Salesforce
    const salesforceClient = createSalesforceClient();
    let sfFields: {
      roleSegment: string | null;
      arr: number | null;
      ownerName: string | null;
      accountName: string | null;
      closeDate: string | null;
      stageName: string | null;
      probability: number | null;
    } | null = null;

    if (salesforceClient && deal.crm_id) {
      try {
        sfFields = await salesforceClient.getOpportunityFields(deal.crm_id);
        const updates: { roleSegment?: string; arr?: number; ownerName?: string } = {};

        if (sfFields.roleSegment && sfFields.roleSegment !== deal.role_segment) {
          console.log(`[Beta Analysis] Updating role_segment: ${deal.role_segment || 'null'} -> ${sfFields.roleSegment}`);
          updates.roleSegment = sfFields.roleSegment;
          deal.role_segment = sfFields.roleSegment;
        }

        if (sfFields.arr !== null && sfFields.arr !== deal.arr) {
          console.log(`[Beta Analysis] Updating ARR: ${deal.arr || 'null'} -> ${sfFields.arr}`);
          updates.arr = sfFields.arr;
          deal.arr = sfFields.arr;
        }

        if (sfFields.ownerName && sfFields.ownerName !== deal.owner_name) {
          console.log(`[Beta Analysis] Updating owner_name: ${deal.owner_name || 'null'} -> ${sfFields.ownerName}`);
          updates.ownerName = sfFields.ownerName;
          deal.owner_name = sfFields.ownerName;
        }

        if (Object.keys(updates).length > 0) {
          await updateDealSalesforceFields(deal.id, updates);
        }
      } catch (error) {
        console.error('[Beta Analysis] Failed to fetch Salesforce data:', error);
      }
    }

    // Fetch all interactions
    const interactions = await getInteractionsForDeal(deal.id);
    const manualEmails = await getManualEmailsForDeal(deal.id);

    console.log(`[Beta Analysis] Found ${interactions.length} interaction(s) and ${manualEmails.length} manual email(s)`);

    if (interactions.length === 0 && manualEmails.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No interactions found for this deal',
      }, { status: 400 });
    }

    // Build context from all interactions
    const context = await buildContext(interactions, manualEmails);
    const dealInfo = formatDealInfo(deal);

    console.log(`[Beta Analysis] Context built: ${context.length} chars`);

    // Load the CoM Enhanced prompt
    const promptTemplate = await loadPrompt('com-enhanced-analysis.md');
    const fullPrompt = fillPrompt(promptTemplate, dealInfo, context);

    console.log(`[Beta Analysis] Prompt ready: ${fullPrompt.length} chars`);

    // Call Claude API
    const claudeClient = new ClaudeClient(process.env.ANTHROPIC_API_KEY!);
    const analysisResult = await claudeClient.analyze(fullPrompt);

    console.log('[Beta Analysis] Claude analysis complete');
    console.log(`[Beta Analysis] Full response length: ${analysisResult.fullResponse.length} chars`);

    // Parse structured data from response
    const structuredData = parseStructuredData(analysisResult.fullResponse);
    if (structuredData) {
      console.log(`[Beta Analysis] Parsed structured data: dealHealthScore=${structuredData.dealHealthScore}, momentum=${structuredData.momentum}`);
    } else {
      console.warn('[Beta Analysis] Could not parse structured data from response');
    }

    // Post to beta Slack channel
    let slackThreadTs: string | undefined;
    const betaChannel = process.env.SLACK_CHANNEL_BETA;

    if (betaChannel) {
      try {
        const slackClient = new SlackClient(
          process.env.SLACK_BOT_TOKEN!,
          process.env.SLACK_CHANNEL_ID! // Default channel (not used, but required by constructor)
        );

        const analysisForSlack = {
          ...analysisResult,
          id: '',
          deal_id: deal.id,
          analysis_type: 'com_enhanced' as const,
          exec_summary: analysisResult.execSummary,
          next_steps: analysisResult.nextSteps,
          created_at: new Date(),
        };

        slackThreadTs = await slackClient.postAnalysis(
          deal,
          analysisForSlack,
          interactions,
          manualEmails,
          betaChannel
        );

        console.log(`[Beta Analysis] Posted to beta channel ${betaChannel}, thread:`, slackThreadTs);
      } catch (error) {
        console.error('[Beta Analysis] Failed to post to Slack:', error);
      }
    } else {
      console.warn('[Beta Analysis] No SLACK_CHANNEL_BETA configured, skipping Slack post');
    }

    // Store analysis in database with structured data
    const savedAnalysis = await createAnalysis(deal.id, 'com_enhanced', {
      execSummary: analysisResult.execSummary,
      nextSteps: analysisResult.nextSteps,
      details: analysisResult.details,
      structuredData: structuredData || undefined,
      slackThreadTs,
      slackChannel: betaChannel,
    });

    console.log('[Beta Analysis] Saved to database:', savedAnalysis.id);

    // Write to Google Sheets if structured data was parsed
    if (structuredData) {
      const sheetsClient = createGoogleSheetsClient();
      if (sheetsClient) {
        try {
          await sheetsClient.upsertDealTracking({
            opportunity: deal.name,
            account: sfFields?.accountName || deal.account_name || '',
            opportunityOwner: sfFields?.ownerName || deal.owner_name || '',
            arr: sfFields?.arr || deal.arr || null,
            closeDate: sfFields?.closeDate || null,
            oppStage: sfFields?.stageName || deal.stage,
            sfdcProbability: sfFields?.probability || null,
            anrokProbability: structuredData.probability ?? null,
            dealSummary: structuredData.dealSummary,
            currentNextSteps: structuredData.currentNextSteps,
            untappedOpportunities: structuredData.untappedOpportunities,
            risks: structuredData.criticalIssues?.join(', ') || '',
          });
          console.log('[Beta Analysis] Updated Google Sheets');
        } catch (error) {
          console.error('[Beta Analysis] Failed to update Google Sheets:', error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      dealId: deal.id,
      dealName: deal.name,
      analysisId: savedAnalysis.id,
      slackThread: slackThreadTs,
      structuredData: structuredData ? {
        dealHealthScore: structuredData.dealHealthScore,
        momentum: structuredData.momentum,
        confidenceLevel: structuredData.confidenceLevel,
        buyerScenario: structuredData.buyerScenario,
        primaryValueDriver: structuredData.primaryValueDriver,
      } : null,
      summary: {
        interactions: interactions.length,
        emails: manualEmails.length,
        execSummary: analysisResult.execSummary.substring(0, 200) + '...',
      },
    });

  } catch (error) {
    console.error('[Beta Analysis] Error:', error);

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
