import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { WebClient } from '@slack/web-api';
import { retrieveContent } from '@/lib/blob/storage';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Customer Insights Endpoint
 *
 * Analyzes transcripts to extract:
 * 1. What customers say is going well (with quotes)
 * 2. What customers are frustrated by (with quotes)
 * 3. Closed Lost customer feedback analysis
 *
 * Supports:
 * - Slack slash command: /insights [days]
 * - Webhook: POST with channel_id and optional days
 */

const DEFAULT_DAYS = 14;
const MAX_TRANSCRIPTS_PER_ANALYSIS = 50; // Limit to avoid token limits

export async function POST(request: NextRequest) {
  console.log('[Insights] Received request');

  try {
    const contentType = request.headers.get('content-type') || '';
    console.log(`[Insights] Content-Type: ${contentType}`);

    let channelId: string | undefined;
    let days: number = DEFAULT_DAYS;
    let responseUrl: string | undefined;
    let isSlashCommand = false;

    // Parse request based on content type
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Slack slash command format
      const formData = await request.formData();
      channelId = formData.get('channel_id') as string;
      responseUrl = formData.get('response_url') as string;
      const text = (formData.get('text') as string || '').trim();
      isSlashCommand = true;

      // Parse days from command text
      if (text) {
        const parsedDays = parseInt(text);
        if (!isNaN(parsedDays) && parsedDays > 0 && parsedDays <= 365) {
          days = parsedDays;
        }
      }

      console.log(`[Insights] Slash command from channel ${channelId}, days=${days}`);
    } else {
      // JSON webhook format
      const body = await request.json();
      channelId = body.channel_id || body.channel;
      days = body.days || DEFAULT_DAYS;
      responseUrl = body.response_url; // Pass through for background processing

      // Verify API key for webhook requests (check both header and body for internal calls)
      const apiKey = request.headers.get('x-api-key') || body.api_key;
      if (apiKey !== process.env.INTERNAL_API_KEY) {
        console.log('[Insights] Auth failed - key mismatch');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      console.log(`[Insights] Webhook request, days=${days}`);
    }

    // For slash commands, respond immediately and trigger background processing
    if (isSlashCommand && channelId) {
      // Trigger processing via internal API call (runs in separate invocation)
      // Use the same origin as the incoming request
      const baseUrl = new URL(request.url).origin;

      const internalKey = process.env.INTERNAL_API_KEY || '';
      console.log(`[Insights] Triggering background call to ${baseUrl}, key length: ${internalKey.length}`);

      fetch(`${baseUrl}/api/slack-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': internalKey,
        },
        body: JSON.stringify({
          channel_id: channelId,
          days,
          response_url: responseUrl,
          api_key: internalKey, // Backup in body
        }),
      }).catch(err => {
        console.error('[Insights] Failed to trigger background processing:', err);
      });

      return NextResponse.json({
        response_type: 'ephemeral',
        text: `⏳ Analyzing customer feedback from the last ${days} days... This may take a few minutes.`,
      });
    }

    // For webhook/API requests, process and return
    const result = await processAndPost(channelId, days, responseUrl);
    return NextResponse.json(result);

  } catch (error) {
    console.error('[Insights] Error:', error);
    // Always return 200 to Slack to prevent retry loops
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `❌ Error: ${(error as Error).message}`,
    });
  }
}

/**
 * Process transcripts and generate insights
 */
async function processAndPost(
  channelId: string | undefined,
  days: number,
  responseUrl?: string
): Promise<any> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffIso = cutoffDate.toISOString();

  console.log(`[Insights] Fetching transcripts since ${cutoffIso}`);

  // Fetch active deal transcripts
  const activeQuery = await sql`
    SELECT i.id, i.external_id, i.title, i.timestamp, i.blob_url,
           d.name as deal_name, d.crm_id, d.stage, d.account_name
    FROM interactions i
    JOIN deals d ON i.deal_id = d.id
    WHERE i.type = 'call'
      AND i.blob_url IS NOT NULL
      AND i.timestamp >= ${cutoffIso}::timestamp
      AND d.stage NOT ILIKE '%closed%'
      AND d.stage NOT ILIKE '%won%'
      AND d.stage NOT ILIKE '%lost%'
    ORDER BY i.timestamp DESC
    LIMIT ${MAX_TRANSCRIPTS_PER_ANALYSIS}
  `;

  // Fetch closed lost transcripts
  const closedLostQuery = await sql`
    SELECT i.id, i.external_id, i.title, i.timestamp, i.blob_url,
           d.name as deal_name, d.crm_id, d.stage, d.account_name
    FROM interactions i
    JOIN deals d ON i.deal_id = d.id
    WHERE i.type = 'call'
      AND i.blob_url IS NOT NULL
      AND i.timestamp >= ${cutoffIso}::timestamp
      AND (d.stage ILIKE '%closed%lost%' OR d.stage ILIKE '%lost%')
    ORDER BY i.timestamp DESC
    LIMIT ${MAX_TRANSCRIPTS_PER_ANALYSIS}
  `;

  const activeTranscripts = activeQuery.rows;
  const closedLostTranscripts = closedLostQuery.rows;

  console.log(`[Insights] Found ${activeTranscripts.length} active transcripts, ${closedLostTranscripts.length} closed lost`);

  if (activeTranscripts.length === 0 && closedLostTranscripts.length === 0) {
    const message = `No transcripts found in the last ${days} days.`;
    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_type: 'ephemeral', text: message }),
      });
    }
    return { success: true, message, insights: null };
  }

  // Build transcript content for analysis
  const activeContent = await buildTranscriptContent(activeTranscripts);
  const closedLostContent = await buildTranscriptContent(closedLostTranscripts);

  // Analyze with Claude
  const insights = await analyzeWithClaude(activeContent, closedLostContent, days);

  // Post to Slack if channel provided
  if (channelId) {
    await postInsightsToSlack(channelId, insights, days, activeTranscripts.length, closedLostTranscripts.length);
  }

  // Respond to slash command
  if (responseUrl) {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'in_channel',
        text: `✅ Customer insights analysis complete. Check the channel for detailed results.`,
      }),
    });
  }

  return {
    success: true,
    insights,
    stats: {
      days,
      activeTranscripts: activeTranscripts.length,
      closedLostTranscripts: closedLostTranscripts.length,
    },
  };
}

/**
 * Build transcript content for Claude analysis
 */
async function buildTranscriptContent(transcripts: any[]): Promise<string> {
  const contents: string[] = [];

  for (const t of transcripts) {
    try {
      const raw = await retrieveContent(t.blob_url);
      const transcript = JSON.parse(raw);

      let text = `\n--- CALL: ${t.deal_name || t.account_name || 'Unknown'} (${new Date(t.timestamp).toLocaleDateString()}) ---\n`;

      if (transcript.turns && Array.isArray(transcript.turns)) {
        // Extract customer turns (look for external/customer speakers)
        for (const turn of transcript.turns) {
          // Include all turns but mark speaker role
          const speaker = turn.speaker || 'Unknown';
          const role = turn.speakerRole || 'other';
          text += `[${role === 'customer' ? 'CUSTOMER' : 'ANROK'}] ${speaker}: ${turn.text}\n`;
        }
      }

      contents.push(text);
    } catch (err) {
      console.error(`[Insights] Failed to process transcript ${t.external_id}:`, err);
    }
  }

  return contents.join('\n');
}

/**
 * Analyze transcripts with Claude
 */
async function analyzeWithClaude(
  activeContent: string,
  closedLostContent: string,
  days: number
): Promise<{
  positives: { quote: string; context: string; dealName?: string }[];
  frustrations: { quote: string; context: string; dealName?: string }[];
  closedLostFeedback: { quote: string; context: string; dealName?: string; reason?: string }[];
  summary: string;
}> {
  const anthropic = new Anthropic();

  const prompt = `You are analyzing sales call transcripts from the last ${days} days to extract customer sentiment and feedback.

## ACTIVE DEAL TRANSCRIPTS
${activeContent || '(No active deal transcripts available)'}

## CLOSED LOST DEAL TRANSCRIPTS
${closedLostContent || '(No closed lost transcripts available)'}

## YOUR TASK

Analyze these transcripts and provide insights in the following JSON format:

{
  "positives": [
    {
      "quote": "Exact quote from the customer about what's going well",
      "context": "Brief context about what they're referring to",
      "dealName": "Company name if identifiable"
    }
  ],
  "frustrations": [
    {
      "quote": "Exact quote from the customer about frustrations or concerns",
      "context": "Brief context about the issue",
      "dealName": "Company name if identifiable"
    }
  ],
  "closedLostFeedback": [
    {
      "quote": "Exact quote about why they didn't choose us or their concerns",
      "context": "Brief context",
      "dealName": "Company name if identifiable",
      "reason": "Category: pricing/competition/timing/features/other"
    }
  ],
  "summary": "2-3 paragraph executive summary of overall customer sentiment trends, common themes in positive feedback, common pain points, and key insights from lost deals"
}

## GUIDELINES

1. **Only include ACTUAL quotes** from customers (marked as [CUSTOMER] in transcripts)
2. **Be specific** - include the exact words they used
3. **Look for emotional language** - excitement, frustration, confusion, praise
4. **For closed lost deals**, focus on:
   - Why they chose a competitor
   - What features were missing
   - Pricing concerns
   - Timeline/timing issues
5. **Aim for 5-10 quotes** in each category if available
6. **If transcripts are limited**, include what's available and note it in the summary

Return ONLY valid JSON, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('[Insights] Claude analysis failed:', error);
    return {
      positives: [],
      frustrations: [],
      closedLostFeedback: [],
      summary: `Analysis failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Post insights to Slack
 */
async function postInsightsToSlack(
  channelId: string,
  insights: any,
  days: number,
  activeCount: number,
  closedLostCount: number
): Promise<void> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) {
    throw new Error('SLACK_BOT_TOKEN not configured');
  }

  const slack = new WebClient(slackToken);

  // Post main message
  const mainMessage = await slack.chat.postMessage({
    channel: channelId,
    text: `📊 Customer Insights - Last ${days} Days`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📊 Customer Insights - Last ${days} Days` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Active Deal Calls*\n${activeCount}` },
          { type: 'mrkdwn', text: `*Closed Lost Calls*\n${closedLostCount}` },
        ],
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Generated ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} | See thread for details ⬇️` },
        ],
      },
    ],
  });

  const threadTs = mainMessage.ts!;

  // Post executive summary
  await slack.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: `*📝 Executive Summary*\n\n${insights.summary}`,
  });

  // Post positives
  if (insights.positives && insights.positives.length > 0) {
    let positivesText = '*✅ What Customers Say Is Going Well*\n\n';
    for (const p of insights.positives.slice(0, 10)) {
      positivesText += `> "${p.quote}"\n`;
      positivesText += `_${p.dealName ? `${p.dealName} - ` : ''}${p.context}_\n\n`;
    }

    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: positivesText,
    });
  }

  // Post frustrations
  if (insights.frustrations && insights.frustrations.length > 0) {
    let frustrationsText = '*⚠️ Customer Frustrations & Concerns*\n\n';
    for (const f of insights.frustrations.slice(0, 10)) {
      frustrationsText += `> "${f.quote}"\n`;
      frustrationsText += `_${f.dealName ? `${f.dealName} - ` : ''}${f.context}_\n\n`;
    }

    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: frustrationsText,
    });
  }

  // Post closed lost feedback
  if (insights.closedLostFeedback && insights.closedLostFeedback.length > 0) {
    let lostText = '*📉 Closed Lost Feedback*\n\n';
    for (const cl of insights.closedLostFeedback.slice(0, 10)) {
      lostText += `> "${cl.quote}"\n`;
      lostText += `_${cl.dealName ? `${cl.dealName} - ` : ''}${cl.context}${cl.reason ? ` (${cl.reason})` : ''}_\n\n`;
    }

    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: lostText,
    });
  }

  console.log('[Insights] Posted to Slack thread:', threadTs);
}
