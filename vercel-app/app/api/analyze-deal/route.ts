import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/api-key';
import {
  getDealByCrmId,
  getDealById,
  getInteractionsForDeal,
  getManualEmailsForDeal,
  createAnalysis,
} from '@/lib/db/client';
import { buildContext, formatDealInfo, selectPrompt, fillPrompt } from '@/lib/analysis/builder';
import { ClaudeClient } from '@/lib/claude/client';
import { SlackClient } from '@/lib/slack/client';

/**
 * Deal Analysis API
 * POST /api/analyze-deal
 * 
 * Analyzes a deal with all its interactions using Claude
 * Requires API key authentication
 */

const AnalyzeRequestSchema = z.object({
  crmId: z.string().optional(),
  dealId: z.string().uuid().optional(),
  analysisType: z.enum(['primary', 'customer_sentiment']).optional().default('primary'),
}).refine(data => data.crmId || data.dealId, {
  message: 'Either crmId or dealId must be provided',
});

export async function POST(request: NextRequest) {
  try {
    console.log('[Analysis] Request received');
    
    // Require API key for this endpoint
    const authError = requireApiKey(request);
    if (authError) {
      console.error('[Analysis] Auth failed:', authError.status);
      return authError;
    }
    
    const body = await request.json();
    console.log('[Analysis] Request body:', { crmId: body.crmId, dealId: body.dealId, analysisType: body.analysisType });
    
    const { crmId, dealId, analysisType } = AnalyzeRequestSchema.parse(body);
    
    console.log('[Analysis] Starting analysis for:', crmId || dealId);
    
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
    
    console.log(`[Analysis] Deal found: ${deal.name} (${deal.stage})`);
    
    // Fetch all interactions (calls + emails)
    const interactions = await getInteractionsForDeal(deal.id);
    const manualEmails = await getManualEmailsForDeal(deal.id);
    
    console.log(`[Analysis] Found ${interactions.length} interaction(s) and ${manualEmails.length} manual email(s)`);
    
    if (interactions.length === 0 && manualEmails.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No interactions found for this deal',
      }, { status: 400 });
    }
    
    // Build context from all interactions
    const context = await buildContext(interactions, manualEmails);
    const dealInfo = formatDealInfo(deal);
    
    console.log(`[Analysis] Context built: ${context.length} chars`);
    
    // Select appropriate prompt
    const promptTemplate = await selectPrompt(deal.stage);
    const fullPrompt = fillPrompt(promptTemplate, dealInfo, context);
    
    console.log(`[Analysis] Prompt ready: ${fullPrompt.length} chars`);
    
    // Call Claude API
    const claudeClient = new ClaudeClient(process.env.ANTHROPIC_API_KEY!);
    const analysisResult = await claudeClient.analyze(fullPrompt);
    
    console.log('[Analysis] Claude analysis complete');
    console.log(`[Analysis] Exec summary length: ${analysisResult.execSummary.length} chars`);
    console.log(`[Analysis] Next steps length: ${analysisResult.nextSteps.length} chars`);
    console.log(`[Analysis] Full response length: ${analysisResult.fullResponse.length} chars`);
    
    // Determine analysis type based on deal stage
    let dbAnalysisType: 'active_health' | 'closed_lost' | 'closed_won' | 'customer_sentiment';
    
    if (analysisType === 'customer_sentiment') {
      dbAnalysisType = 'customer_sentiment';
    } else if (deal.stage === 'active' || deal.stage === 'in_progress') {
      dbAnalysisType = 'active_health';
    } else if (deal.stage === 'closed_lost') {
      dbAnalysisType = 'closed_lost';
    } else if (deal.stage === 'closed_won') {
      dbAnalysisType = 'closed_won';
    } else {
      dbAnalysisType = 'active_health'; // Default
    }
    
    // Post to Slack
    let slackThreadTs: string | undefined;
    let slackChannel: string | undefined;
    
    try {
      const slackClient = new SlackClient(
        process.env.SLACK_BOT_TOKEN!,
        process.env.SLACK_CHANNEL_ID!
      );
      
      slackThreadTs = await slackClient.postAnalysis(
        deal, 
        {
          ...analysisResult,
          id: '', // Will be set after DB insert
          deal_id: deal.id,
          analysis_type: dbAnalysisType,
          exec_summary: analysisResult.execSummary,
          next_steps: analysisResult.nextSteps,
          created_at: new Date(),
        },
        interactions, // Pass interactions
        manualEmails // Pass emails
      );
      
      slackChannel = process.env.SLACK_CHANNEL_ID!;
      
      console.log('[Analysis] Posted to Slack thread:', slackThreadTs);
    } catch (error) {
      console.error('[Analysis] Failed to post to Slack:', error);
      // Continue even if Slack fails
    }
    
    // Store analysis in database
    const savedAnalysis = await createAnalysis(deal.id, dbAnalysisType, {
      execSummary: analysisResult.execSummary,
      nextSteps: analysisResult.nextSteps,
      details: analysisResult.details,
      slackThreadTs,
      slackChannel,
    });
    
    console.log('[Analysis] Saved to database:', savedAnalysis.id);
    
    return NextResponse.json({
      success: true,
      dealId: deal.id,
      dealName: deal.name,
      analysisId: savedAnalysis.id,
      slackThread: slackThreadTs,
      summary: {
        interactions: interactions.length,
        emails: manualEmails.length,
        execSummary: analysisResult.execSummary.substring(0, 200) + '...',
      },
    });
    
  } catch (error) {
    console.error('[Analysis] Error:', error);
    
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

