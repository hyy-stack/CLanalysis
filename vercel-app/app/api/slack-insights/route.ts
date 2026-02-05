import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { sql } from '@vercel/postgres';
import { WebClient } from '@slack/web-api';
import { retrieveContent } from '@/lib/blob/storage';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Customer Insights Endpoint - Map-Reduce Pattern
 *
 * Scalable analysis using:
 * 1. Map phase: Extract quotes from batches in parallel
 * 2. Reduce phase: Categorize quotes into themes
 *
 * Output:
 * - Thematic categories (e.g., "Ease of Use", "Automation")
 * - Quotes grouped under relevant themes
 * - Separate sections for positives and concerns
 *
 * Supports:
 * - Slack slash command: /insights [days]
 * - Webhook: POST with channel_id and optional days
 */

const DEFAULT_DAYS = 14;
const MAX_TRANSCRIPTS = 100; // Can handle more with map-reduce
const BATCH_SIZE = 10; // Transcripts per batch in map phase
const MAX_CHARS_PER_TRANSCRIPT = 12000; // ~3k tokens per transcript

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

    // For slash commands, respond immediately and run processing in background
    if (isSlashCommand && channelId) {
      console.log(`[Insights] Scheduling background processing for channel ${channelId}`);

      // Use Next.js after() to run processing after response is sent
      // This ensures the work continues even after we return to Slack
      after(async () => {
        try {
          console.log(`[Insights] Background processing started for ${days} days`);
          await processAndPost(channelId, days, responseUrl);
          console.log(`[Insights] Background processing completed`);
        } catch (err) {
          console.error('[Insights] Background processing failed:', err);
          // Try to notify via response_url if available
          if (responseUrl) {
            try {
              await fetch(responseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  response_type: 'ephemeral',
                  text: `❌ Analysis failed: ${(err as Error).message}`,
                }),
              });
            } catch {
              // Ignore notification failures
            }
          }
        }
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

  // Fetch active deal transcripts (include participants for speaker identification)
  const activeQuery = await sql`
    SELECT i.id, i.external_id, i.title, i.timestamp, i.blob_url, i.participants,
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
    LIMIT ${MAX_TRANSCRIPTS}
  `;

  // Fetch closed lost transcripts
  const closedLostQuery = await sql`
    SELECT i.id, i.external_id, i.title, i.timestamp, i.blob_url, i.participants,
           d.name as deal_name, d.crm_id, d.stage, d.account_name
    FROM interactions i
    JOIN deals d ON i.deal_id = d.id
    WHERE i.type = 'call'
      AND i.blob_url IS NOT NULL
      AND i.timestamp >= ${cutoffIso}::timestamp
      AND (d.stage ILIKE '%closed%lost%' OR d.stage ILIKE '%lost%')
    ORDER BY i.timestamp DESC
    LIMIT ${MAX_TRANSCRIPTS}
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

  // === MAP-REDUCE ANALYSIS ===

  // Combine all transcripts with a source flag
  const allTranscripts = [
    ...activeTranscripts.map(t => ({ ...t, source: 'active' as const })),
    ...closedLostTranscripts.map(t => ({ ...t, source: 'closed_lost' as const })),
  ];

  console.log(`[Insights] Starting map-reduce analysis for ${allTranscripts.length} transcripts`);

  // MAP PHASE: Extract quotes from batches in parallel
  const batches = splitIntoBatches(allTranscripts, BATCH_SIZE);
  console.log(`[Insights] Split into ${batches.length} batches`);

  const extractionPromises = batches.map((batch, index) =>
    extractQuotesFromBatch(batch, index, batches.length)
  );

  const batchResults = await Promise.all(extractionPromises);
  const allQuotes = batchResults.flat();

  console.log(`[Insights] Extracted ${allQuotes.length} quotes from map phase`);

  // REDUCE PHASE: Categorize quotes into themes
  const categorizedInsights = await categorizeQuotes(allQuotes, days);

  console.log(`[Insights] Categorized into ${categorizedInsights.positiveCategories.length} positive and ${categorizedInsights.concernCategories.length} concern categories`);

  // Post to Slack if channel provided
  if (channelId) {
    await postCategorizedInsightsToSlack(
      channelId,
      categorizedInsights,
      days,
      activeTranscripts.length,
      closedLostTranscripts.length,
      allQuotes.length
    );
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
    insights: categorizedInsights,
    stats: {
      days,
      activeTranscripts: activeTranscripts.length,
      closedLostTranscripts: closedLostTranscripts.length,
      totalQuotes: allQuotes.length,
    },
  };
}

// === TYPES ===

interface ExtractedQuote {
  quote: string;
  context: string;
  dealName: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  source: 'active' | 'closed_lost';
}

interface ThematicCategory {
  name: string;
  summary: string;
  quotes: { quote: string; dealName: string; context: string }[];
}

interface CategorizedInsights {
  positiveCategories: ThematicCategory[];
  concernCategories: ThematicCategory[];
  closedLostCategories: ThematicCategory[];
  summary: string;
}

// === MAP PHASE ===

/**
 * Split transcripts into batches for parallel processing
 */
function splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Extract quotes from a single batch of transcripts
 */
async function extractQuotesFromBatch(
  batch: Array<any & { source: 'active' | 'closed_lost' }>,
  batchIndex: number,
  totalBatches: number
): Promise<ExtractedQuote[]> {
  console.log(`[Insights] Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} transcripts)`);

  const transcriptContents = await buildTranscriptContentForBatch(batch);

  if (!transcriptContents.trim()) {
    console.log(`[Insights] Batch ${batchIndex + 1} has no content, skipping`);
    return [];
  }

  const anthropic = new Anthropic();

  const prompt = `Extract all meaningful customer quotes from these sales call transcripts.

## TRANSCRIPTS
${transcriptContents}

## INSTRUCTIONS

1. Only extract quotes from speakers labeled [CUSTOMER] - never from [ANROK] speakers
2. Focus on quotes about:
   - Product feedback (positive or negative)
   - Pain points and frustrations
   - What's working well
   - Concerns about pricing, features, competition
   - Reasons for decisions (especially in closed lost deals)
3. Skip small talk, greetings, and generic responses
4. Include the exact words they used

Return a JSON array of quotes:
[
  {
    "quote": "Exact customer quote",
    "context": "Brief context (1 sentence)",
    "dealName": "Company name from the transcript header",
    "sentiment": "positive" | "negative" | "neutral",
    "source": "active" | "closed_lost"
  }
]

If no meaningful quotes found, return an empty array: []

Return ONLY valid JSON, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return [];
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`[Insights] Batch ${batchIndex + 1}: No JSON array found in response`);
      return [];
    }

    const quotes = JSON.parse(jsonMatch[0]) as ExtractedQuote[];
    console.log(`[Insights] Batch ${batchIndex + 1}: Extracted ${quotes.length} quotes`);
    return quotes;
  } catch (error) {
    console.error(`[Insights] Batch ${batchIndex + 1} extraction failed:`, error);
    return [];
  }
}

/**
 * Build transcript content for a batch, including source metadata
 */
async function buildTranscriptContentForBatch(
  transcripts: Array<any & { source: 'active' | 'closed_lost' }>
): Promise<string> {
  const contents: string[] = [];

  for (const t of transcripts) {
    try {
      const raw = await retrieveContent(t.blob_url);
      const transcript = JSON.parse(raw);

      const speakerMap = buildSpeakerMap(t.participants);

      let text = `\n--- CALL: ${t.deal_name || t.account_name || 'Unknown'} | Source: ${t.source} | Date: ${new Date(t.timestamp).toLocaleDateString()} ---\n`;

      if (transcript.turns && Array.isArray(transcript.turns)) {
        for (const turn of transcript.turns) {
          const speakerId = String(turn.speakerId || turn.speaker || 'unknown');
          const speakerInfo = speakerMap.get(speakerId);

          let label: string;
          if (speakerInfo) {
            label = speakerInfo.isAnrok
              ? `[ANROK] ${speakerInfo.name}`
              : `[CUSTOMER] ${speakerInfo.name}`;
          } else {
            label = `Speaker ${speakerId.slice(-4)}`;
          }

          text += `${label}: ${turn.text}\n`;
        }
      }

      if (text.length > MAX_CHARS_PER_TRANSCRIPT) {
        text = text.substring(0, MAX_CHARS_PER_TRANSCRIPT) + '\n[...truncated]';
      }

      contents.push(text);
    } catch (err) {
      console.error(`[Insights] Failed to process transcript ${t.external_id}:`, err);
    }
  }

  return contents.join('\n');
}

// === REDUCE PHASE ===

/**
 * Categorize extracted quotes into thematic groups
 */
async function categorizeQuotes(
  quotes: ExtractedQuote[],
  days: number
): Promise<CategorizedInsights> {
  if (quotes.length === 0) {
    return {
      positiveCategories: [],
      concernCategories: [],
      closedLostCategories: [],
      summary: 'No customer quotes were extracted from the transcripts.',
    };
  }

  const anthropic = new Anthropic();

  // Separate quotes by type for the prompt
  const positiveQuotes = quotes.filter(q => q.sentiment === 'positive');
  const negativeQuotes = quotes.filter(q => q.sentiment === 'negative' && q.source === 'active');
  const closedLostQuotes = quotes.filter(q => q.source === 'closed_lost');

  const prompt = `You are analyzing ${quotes.length} customer quotes from sales calls over the last ${days} days.

## POSITIVE QUOTES (${positiveQuotes.length})
${JSON.stringify(positiveQuotes, null, 2)}

## CONCERN/FRUSTRATION QUOTES FROM ACTIVE DEALS (${negativeQuotes.length})
${JSON.stringify(negativeQuotes, null, 2)}

## CLOSED LOST DEAL QUOTES (${closedLostQuotes.length})
${JSON.stringify(closedLostQuotes, null, 2)}

## YOUR TASK

Group these quotes into thematic categories. Categories should emerge naturally from the data.

For POSITIVE feedback, look for themes like:
- Ease of Use / Simplicity
- Time Savings / Automation
- Customer Support / Responsiveness
- Product Reliability
- Integration Quality
- Value for Money

For CONCERNS/FRUSTRATIONS, look for themes like:
- Pricing Concerns
- Missing Features
- Implementation Complexity
- Documentation Gaps
- Competitive Comparisons

For CLOSED LOST, focus on:
- Why they chose competitor
- Deal-breaker issues
- Timing/budget constraints

Return JSON in this exact format:
{
  "positiveCategories": [
    {
      "name": "Theme Name",
      "summary": "One sentence describing this theme",
      "quotes": [
        { "quote": "exact quote", "dealName": "Company", "context": "brief context" }
      ]
    }
  ],
  "concernCategories": [
    {
      "name": "Theme Name",
      "summary": "One sentence describing this theme",
      "quotes": [
        { "quote": "exact quote", "dealName": "Company", "context": "brief context" }
      ]
    }
  ],
  "closedLostCategories": [
    {
      "name": "Theme Name (e.g., Chose Competitor, Budget Constraints)",
      "summary": "One sentence describing this theme",
      "quotes": [
        { "quote": "exact quote", "dealName": "Company", "context": "brief context" }
      ]
    }
  ],
  "summary": "2-3 paragraph executive summary covering: (1) overall sentiment trends, (2) strongest positive themes, (3) main concerns to address, (4) patterns in lost deals"
}

## GUIDELINES

1. Create 3-6 categories per section (don't force categories if not enough data)
2. Each category should have at least 2 quotes if possible
3. Don't repeat quotes across categories
4. Categories should be specific (not generic like "General Feedback")
5. If a section has no quotes, return an empty array for that section
6. The summary should be actionable and highlight key patterns

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

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('[Insights] Categorization failed:', error);
    return {
      positiveCategories: [],
      concernCategories: [],
      closedLostCategories: [],
      summary: `Categorization failed: ${(error as Error).message}`,
    };
  }
}

// === HELPER FUNCTIONS ===

/**
 * Build speaker map from participants data
 * Maps speakerId to { name, isAnrok }
 */
function buildSpeakerMap(participants: any[]): Map<string, { name: string; isAnrok: boolean }> {
  const speakerMap = new Map<string, { name: string; isAnrok: boolean }>();

  if (!participants || !Array.isArray(participants)) {
    return speakerMap;
  }

  for (const p of participants) {
    const speakerId = p.speakerId || p.id;
    if (!speakerId) continue;

    const name = p.name || p.emailAddress?.split('@')[0] || 'Unknown';
    const email = p.emailAddress || '';
    const isAnrok = email.toLowerCase().includes('@anrok.com') ||
                    email.toLowerCase().includes('@anrok.io') ||
                    (p.affiliation === 'internal');

    speakerMap.set(String(speakerId), { name, isAnrok });
  }

  return speakerMap;
}

// === SLACK OUTPUT ===

/**
 * Post categorized insights to Slack with thematic grouping
 */
async function postCategorizedInsightsToSlack(
  channelId: string,
  insights: CategorizedInsights,
  days: number,
  activeCount: number,
  closedLostCount: number,
  totalQuotes: number
): Promise<void> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) {
    throw new Error('SLACK_BOT_TOKEN not configured');
  }

  const slack = new WebClient(slackToken);

  // Post main message with stats
  const mainMessage = await slack.chat.postMessage({
    channel: channelId,
    text: `Customer Insights - Last ${days} Days`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `Customer Insights - Last ${days} Days` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Calls Analyzed*\n${activeCount + closedLostCount}` },
          { type: 'mrkdwn', text: `*Quotes Extracted*\n${totalQuotes}` },
        ],
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Active Deals*\n${activeCount}` },
          { type: 'mrkdwn', text: `*Closed Lost*\n${closedLostCount}` },
        ],
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Generated ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} | See thread for details` },
        ],
      },
    ],
  });

  const threadTs = mainMessage.ts!;

  // Post executive summary
  await slack.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: `*Executive Summary*\n\n${insights.summary}`,
  });

  // Post positive categories
  if (insights.positiveCategories && insights.positiveCategories.length > 0) {
    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `*What's Going Well*\n${'━'.repeat(30)}`,
    });

    for (const category of insights.positiveCategories) {
      let categoryText = `*${category.name}*\n_${category.summary}_\n\n`;

      for (const q of category.quotes.slice(0, 5)) {
        categoryText += `> "${q.quote}"\n`;
        categoryText += `_— ${q.dealName}${q.context ? `: ${q.context}` : ''}_\n\n`;
      }

      if (category.quotes.length > 5) {
        categoryText += `_...and ${category.quotes.length - 5} more quotes_\n`;
      }

      await slack.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: categoryText,
      });
    }
  }

  // Post concern categories
  if (insights.concernCategories && insights.concernCategories.length > 0) {
    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `*Concerns & Frustrations*\n${'━'.repeat(30)}`,
    });

    for (const category of insights.concernCategories) {
      let categoryText = `*${category.name}*\n_${category.summary}_\n\n`;

      for (const q of category.quotes.slice(0, 5)) {
        categoryText += `> "${q.quote}"\n`;
        categoryText += `_— ${q.dealName}${q.context ? `: ${q.context}` : ''}_\n\n`;
      }

      if (category.quotes.length > 5) {
        categoryText += `_...and ${category.quotes.length - 5} more quotes_\n`;
      }

      await slack.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: categoryText,
      });
    }
  }

  // Post closed lost categories
  if (insights.closedLostCategories && insights.closedLostCategories.length > 0) {
    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `*Closed Lost Feedback*\n${'━'.repeat(30)}`,
    });

    for (const category of insights.closedLostCategories) {
      let categoryText = `*${category.name}*\n_${category.summary}_\n\n`;

      for (const q of category.quotes.slice(0, 5)) {
        categoryText += `> "${q.quote}"\n`;
        categoryText += `_— ${q.dealName}${q.context ? `: ${q.context}` : ''}_\n\n`;
      }

      if (category.quotes.length > 5) {
        categoryText += `_...and ${category.quotes.length - 5} more quotes_\n`;
      }

      await slack.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: categoryText,
      });
    }
  }

  console.log('[Insights] Posted categorized insights to Slack thread:', threadTs);
}
