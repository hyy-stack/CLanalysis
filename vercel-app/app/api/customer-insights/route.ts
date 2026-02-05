import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { analyzeInsights } from '@/lib/insights/analyze';

/**
 * Customer Insights Endpoint
 * Analyzes feedback from closed-won deals (post-sales customers using Anrok)
 *
 * Slack command: /customer-insights [days]
 */

export const maxDuration = 300; // Pro tier: 5 minutes

const DEFAULT_DAYS = 14;

export async function POST(request: NextRequest) {
  console.log('[Customer Insights] Received request');

  try {
    const contentType = request.headers.get('content-type') || '';

    let channelId: string | undefined;
    let days: number = DEFAULT_DAYS;
    let responseUrl: string | undefined;
    let isSlashCommand = false;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      channelId = formData.get('channel_id') as string;
      responseUrl = formData.get('response_url') as string;
      const text = (formData.get('text') as string || '').trim();
      isSlashCommand = true;

      if (text) {
        const parsedDays = parseInt(text);
        if (!isNaN(parsedDays) && parsedDays > 0 && parsedDays <= 365) {
          days = parsedDays;
        }
      }

      console.log(`[Customer Insights] Slash command from channel ${channelId}, days=${days}`);
    } else {
      const body = await request.json();
      channelId = body.channel_id || body.channel;
      days = body.days || DEFAULT_DAYS;
      responseUrl = body.response_url;

      const apiKey = request.headers.get('x-api-key') || body.api_key;
      if (apiKey !== process.env.INTERNAL_API_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    if (isSlashCommand && channelId) {
      after(async () => {
        try {
          console.log(`[Customer Insights] Background processing started`);
          await analyzeInsights('customer', days, channelId, responseUrl);
          console.log(`[Customer Insights] Background processing completed`);
        } catch (err) {
          console.error('[Customer Insights] Background processing failed:', err);
          if (responseUrl) {
            await fetch(responseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                response_type: 'ephemeral',
                text: `❌ Analysis failed: ${(err as Error).message}`,
              }),
            }).catch(() => {});
          }
        }
      });

      return NextResponse.json({
        response_type: 'ephemeral',
        text: `⏳ Analyzing customer feedback from the last ${days} days... This may take a few minutes.`,
      });
    }

    const result = await analyzeInsights('customer', days, channelId, responseUrl);
    return NextResponse.json(result);

  } catch (error) {
    console.error('[Customer Insights] Error:', error);
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `❌ Error: ${(error as Error).message}`,
    });
  }
}
