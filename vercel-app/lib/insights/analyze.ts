/**
 * Core insights analysis logic using map-reduce pattern
 */

import { sql } from '@vercel/postgres';
import { WebClient } from '@slack/web-api';
import { retrieveContent } from '@/lib/blob/storage';
import Anthropic from '@anthropic-ai/sdk';
import {
  InsightType,
  ExtractedQuote,
  CategorizedInsights,
  InsightsResult,
  TranscriptRow,
} from './types';

const MAX_TRANSCRIPTS = 100;
const BATCH_SIZE = 10;
const MAX_CHARS_PER_TRANSCRIPT = 12000;

/**
 * Configuration for each insight type
 */
const INSIGHT_CONFIG: Record<InsightType, {
  title: string;
  emoji: string;
  queryCondition: string;
  extractionContext: string;
  categorizationContext: string;
}> = {
  prospect: {
    title: 'Prospect Insights',
    emoji: '🎯',
    queryCondition: `
      d.stage NOT ILIKE '%closed%'
      AND d.stage NOT ILIKE '%won%'
      AND d.stage NOT ILIKE '%lost%'
    `,
    extractionContext: 'These are sales calls with prospects who are evaluating Anrok.',
    categorizationContext: `
For POSITIVE feedback, look for themes like:
- Ease of Use / Simplicity
- Product Demo Impressions
- Competitive Advantages
- Sales Process Experience
- Technical Capabilities

For CONCERNS, look for themes like:
- Pricing Concerns
- Missing Features
- Implementation Worries
- Competitive Comparisons
- Timeline/Resource Constraints`,
  },
  customer: {
    title: 'Customer Insights',
    emoji: '💚',
    queryCondition: `
      (d.stage ILIKE '%closed%won%' OR d.stage ILIKE '%won%')
    `,
    extractionContext: 'These are calls with existing customers who are using Anrok.',
    categorizationContext: `
For POSITIVE feedback, look for themes like:
- Product Satisfaction
- Time Savings / Automation
- Support Experience
- Reliability / Accuracy
- Value Delivered

For CONCERNS, look for themes like:
- Feature Requests
- Usability Issues
- Support Gaps
- Integration Problems
- Billing/Pricing Questions`,
  },
  closed_lost: {
    title: 'Closed Lost Insights',
    emoji: '📉',
    queryCondition: `
      (d.stage ILIKE '%closed%lost%' OR d.stage ILIKE '%lost%')
    `,
    extractionContext: 'These are calls with prospects who ultimately did not choose Anrok.',
    categorizationContext: `
Focus on understanding WHY deals were lost. Look for themes like:
- Chose Competitor (which one and why)
- Pricing Too High
- Missing Critical Features
- Bad Timing / Budget Constraints
- Internal Priorities Changed
- Implementation Concerns
- Went with Status Quo`,
  },
};

/**
 * Main analysis function
 */
export async function analyzeInsights(
  type: InsightType,
  days: number,
  channelId?: string,
  responseUrl?: string
): Promise<InsightsResult> {
  const config = INSIGHT_CONFIG[type];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffIso = cutoffDate.toISOString();

  console.log(`[${config.title}] Fetching transcripts since ${cutoffIso}`);

  // Build and execute query
  const query = await sql.query(`
    SELECT i.id, i.external_id, i.title, i.timestamp, i.blob_url, i.participants,
           d.name as deal_name, d.crm_id, d.stage, d.account_name
    FROM interactions i
    JOIN deals d ON i.deal_id = d.id
    WHERE i.type = 'call'
      AND i.blob_url IS NOT NULL
      AND i.timestamp >= $1::timestamp
      AND (${config.queryCondition})
    ORDER BY i.timestamp DESC
    LIMIT $2
  `, [cutoffIso, MAX_TRANSCRIPTS]);

  const transcripts = query.rows as TranscriptRow[];
  console.log(`[${config.title}] Found ${transcripts.length} transcripts`);

  if (transcripts.length === 0) {
    const message = `No ${type} transcripts found in the last ${days} days.`;
    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_type: 'ephemeral', text: message }),
      });
    }
    return { success: true, message, insights: null, stats: { days, transcriptCount: 0, totalQuotes: 0 } };
  }

  // MAP PHASE: Extract quotes in parallel batches
  const batches = splitIntoBatches(transcripts, BATCH_SIZE);
  console.log(`[${config.title}] Split into ${batches.length} batches`);

  const extractionPromises = batches.map((batch, index) =>
    extractQuotesFromBatch(batch, index, batches.length, config.extractionContext, config.title)
  );

  const batchResults = await Promise.all(extractionPromises);
  const allQuotes = batchResults.flat();
  console.log(`[${config.title}] Extracted ${allQuotes.length} quotes from map phase`);

  // REDUCE PHASE: Categorize quotes into themes
  const categorizedInsights = await categorizeQuotes(allQuotes, days, type, config);
  console.log(`[${config.title}] Categorized into ${categorizedInsights.positiveCategories.length} positive and ${categorizedInsights.concernCategories.length} concern categories`);

  // Post to Slack if channel provided
  if (channelId) {
    await postInsightsToSlack(channelId, categorizedInsights, days, transcripts.length, allQuotes.length, config);
  }

  // Respond to slash command
  if (responseUrl) {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'in_channel',
        text: `✅ ${config.title} analysis complete. Check the channel for detailed results.`,
      }),
    });
  }

  return {
    success: true,
    insights: categorizedInsights,
    stats: {
      days,
      transcriptCount: transcripts.length,
      totalQuotes: allQuotes.length,
    },
  };
}

// === HELPER FUNCTIONS ===

function splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

function buildSpeakerMap(participants: any[]): Map<string, { name: string; isAnrok: boolean }> {
  const speakerMap = new Map<string, { name: string; isAnrok: boolean }>();
  if (!participants || !Array.isArray(participants)) return speakerMap;

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

// === MAP PHASE ===

async function extractQuotesFromBatch(
  batch: TranscriptRow[],
  batchIndex: number,
  totalBatches: number,
  extractionContext: string,
  logPrefix: string
): Promise<ExtractedQuote[]> {
  console.log(`[${logPrefix}] Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} transcripts)`);

  const transcriptContents = await buildTranscriptContentForBatch(batch);
  if (!transcriptContents.trim()) {
    console.log(`[${logPrefix}] Batch ${batchIndex + 1} has no content, skipping`);
    return [];
  }

  const anthropic = new Anthropic();

  const prompt = `Extract all meaningful customer quotes from these sales call transcripts.

## CONTEXT
${extractionContext}

## TRANSCRIPTS
${transcriptContents}

## INSTRUCTIONS

1. Only extract quotes from speakers labeled [CUSTOMER] - never from [ANROK] speakers
2. Focus on quotes about:
   - Product feedback (positive or negative)
   - Pain points and frustrations
   - What's working well
   - Concerns about pricing, features, competition
   - Reasons for decisions
3. Skip small talk, greetings, and generic responses
4. Include the exact words they used

Return a JSON array of quotes:
[
  {
    "quote": "Exact customer quote",
    "context": "Brief context (1 sentence)",
    "dealName": "Company name from the transcript header",
    "sentiment": "positive" | "negative" | "neutral"
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
    if (content.type !== 'text') return [];

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`[${logPrefix}] Batch ${batchIndex + 1}: No JSON array found`);
      return [];
    }

    const quotes = JSON.parse(jsonMatch[0]) as ExtractedQuote[];
    console.log(`[${logPrefix}] Batch ${batchIndex + 1}: Extracted ${quotes.length} quotes`);
    return quotes;
  } catch (error) {
    console.error(`[${logPrefix}] Batch ${batchIndex + 1} extraction failed:`, error);
    return [];
  }
}

async function buildTranscriptContentForBatch(transcripts: TranscriptRow[]): Promise<string> {
  const contents: string[] = [];

  for (const t of transcripts) {
    try {
      const raw = await retrieveContent(t.blob_url);
      const transcript = JSON.parse(raw);
      const speakerMap = buildSpeakerMap(t.participants);

      let text = `\n--- CALL: ${t.deal_name || t.account_name || 'Unknown'} | Date: ${new Date(t.timestamp).toLocaleDateString()} ---\n`;

      if (transcript.turns && Array.isArray(transcript.turns)) {
        for (const turn of transcript.turns) {
          const speakerId = String(turn.speakerId || turn.speaker || 'unknown');
          const speakerInfo = speakerMap.get(speakerId);

          const label = speakerInfo
            ? (speakerInfo.isAnrok ? `[ANROK] ${speakerInfo.name}` : `[CUSTOMER] ${speakerInfo.name}`)
            : `Speaker ${speakerId.slice(-4)}`;

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

async function categorizeQuotes(
  quotes: ExtractedQuote[],
  days: number,
  type: InsightType,
  config: typeof INSIGHT_CONFIG[InsightType]
): Promise<CategorizedInsights> {
  if (quotes.length === 0) {
    return {
      positiveCategories: [],
      concernCategories: [],
      summary: `No customer quotes were extracted from the ${type} transcripts.`,
    };
  }

  const anthropic = new Anthropic();

  const positiveQuotes = quotes.filter(q => q.sentiment === 'positive');
  const negativeQuotes = quotes.filter(q => q.sentiment === 'negative');

  const prompt = `You are analyzing ${quotes.length} customer quotes from ${type === 'closed_lost' ? 'closed lost deals' : type + ' calls'} over the last ${days} days.

## POSITIVE QUOTES (${positiveQuotes.length})
${JSON.stringify(positiveQuotes, null, 2)}

## CONCERN/NEGATIVE QUOTES (${negativeQuotes.length})
${JSON.stringify(negativeQuotes, null, 2)}

## YOUR TASK

Group these quotes into thematic categories. Categories should emerge naturally from the data.
${config.categorizationContext}

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
  "summary": "2-3 paragraph executive summary covering key patterns and actionable insights"
}

## GUIDELINES

1. Create 3-6 categories per section (don't force categories if not enough data)
2. Each category should have at least 2 quotes if possible
3. Don't repeat quotes across categories
4. Categories should be specific (not generic like "General Feedback")
5. If a section has no quotes, return an empty array
6. The summary should be actionable and highlight key patterns

Return ONLY valid JSON, no other text.`;

  try {
    // Use Haiku for faster categorization (quotes already extracted, just organizing)
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error(`[${config.title}] Categorization failed:`, error);
    return {
      positiveCategories: [],
      concernCategories: [],
      summary: `Categorization failed: ${(error as Error).message}`,
    };
  }
}

// === SLACK OUTPUT ===

async function postInsightsToSlack(
  channelId: string,
  insights: CategorizedInsights,
  days: number,
  transcriptCount: number,
  totalQuotes: number,
  config: typeof INSIGHT_CONFIG[InsightType]
): Promise<void> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) throw new Error('SLACK_BOT_TOKEN not configured');

  const slack = new WebClient(slackToken);

  const mainMessage = await slack.chat.postMessage({
    channel: channelId,
    text: `${config.emoji} ${config.title} - Last ${days} Days`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${config.emoji} ${config.title} - Last ${days} Days` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Calls Analyzed*\n${transcriptCount}` },
          { type: 'mrkdwn', text: `*Quotes Extracted*\n${totalQuotes}` },
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
  if (insights.positiveCategories?.length > 0) {
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
      await slack.chat.postMessage({ channel: channelId, thread_ts: threadTs, text: categoryText });
    }
  }

  // Post concern categories
  if (insights.concernCategories?.length > 0) {
    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `*Concerns & Challenges*\n${'━'.repeat(30)}`,
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
      await slack.chat.postMessage({ channel: channelId, thread_ts: threadTs, text: categoryText });
    }
  }

  console.log(`[${config.title}] Posted to Slack thread: ${threadTs}`);
}
