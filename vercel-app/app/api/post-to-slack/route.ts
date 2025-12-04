import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDealById, getLatestAnalysis } from '@/lib/db/client';
import { SlackClient } from '@/lib/slack/client';

/**
 * Slack Posting API
 * POST /api/post-to-slack
 * 
 * Posts an analysis to Slack (can be called independently or by analyze-deal)
 */

const PostRequestSchema = z.object({
  dealId: z.string().uuid(),
  analysisId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dealId, analysisId } = PostRequestSchema.parse(body);
    
    console.log('[Post to Slack] Posting analysis for deal:', dealId);
    
    // Fetch deal
    const deal = await getDealById(dealId);
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }
    
    // Fetch analysis (use provided ID or get latest)
    const analysis = analysisId
      ? await getDealById(analysisId)
      : await getLatestAnalysis(dealId);
    
    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }
    
    // Post to Slack
    const slackClient = new SlackClient(
      process.env.SLACK_BOT_TOKEN!,
      process.env.SLACK_CHANNEL_ID!
    );
    
    const threadTs = await slackClient.postAnalysis(deal, analysis as any);
    
    return NextResponse.json({
      success: true,
      slackThread: threadTs,
      channel: process.env.SLACK_CHANNEL_ID,
    });
    
  } catch (error) {
    console.error('[Post to Slack] Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors,
      }, { status: 400 });
    }
    
    return NextResponse.json({
      error: (error as Error).message,
    }, { status: 500 });
  }
}

