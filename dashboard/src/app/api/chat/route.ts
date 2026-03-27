import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildChatContext, getAllFilteredInteractions, MAX_TRANSCRIPTS_DIRECT } from '@/lib/db';
import type { InteractionMeta } from '@/lib/db';
import type { DealQueryFilters } from '@/lib/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAP_BATCH_SIZE = 12;  // transcripts per map call
const MAP_CONCURRENCY = 8;  // parallel map calls at once

// ─── helpers ──────────────────────────────────────────────────────────────────

interface GongTurn { speakerName?: string; text?: string }

async function fetchTurns(blobUrl: string): Promise<GongTurn[]> {
  if (blobUrl.startsWith('imported://')) return [];
  try {
    const res = await fetch(blobUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as { turns?: GongTurn[] };
    return data.turns ?? [];
  } catch { return []; }
}

function formatTranscriptForMap(interaction: InteractionMeta, turns: GongTurn[]): string {
  const date = new Date(interaction.timestamp).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const lines = [
    `CALL: "${interaction.title ?? 'Untitled'}" | Deal: ${interaction.deal_name} | Stage: ${interaction.stage ?? 'Unknown'} | ${date}`,
    'TRANSCRIPT:',
    // cap turns per transcript in map phase — summaries don't need full text
    ...turns.slice(0, 200).map(t => `${t.speakerName ?? 'Unknown'}: ${t.text ?? ''}`),
  ];
  if (turns.length > 200) lines.push(`... (${turns.length - 200} more turns omitted)`);
  return lines.join('\n');
}

/** Map phase: summarise a batch of transcripts relevant to the user's question. */
async function mapBatch(
  interactions: InteractionMeta[],
  question: string,
  batchIndex: number,
  total: number,
): Promise<string> {
  // Fetch all turns in the batch concurrently
  const turnsPerCall = await Promise.all(interactions.map(i => fetchTurns(i.blob_url)));

  const transcriptBlocks = interactions
    .map((interaction, j) => formatTranscriptForMap(interaction, turnsPerCall[j]))
    .join('\n\n---\n\n');

  const prompt = `Extract sales insights relevant to: "${question}"

Rules:
- 2-4 bullets per call, no sentences, no filler
- Only include content directly relevant to the question
- Skip calls with no relevant content (write "SKIP")
- Be ruthlessly brief

Format:
CALL: <title> | <deal> | <date>
• <insight>
• <insight>

TRANSCRIPTS:
${transcriptBlocks}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001', // fast + cheap for map phase
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  console.log(`[chat/map] batch ${batchIndex + 1}/${total} done`);
  return text;
}

/** Run map batches with limited concurrency. */
async function mapAllTranscripts(interactions: InteractionMeta[], question: string): Promise<string[]> {
  const batches: InteractionMeta[][] = [];
  for (let i = 0; i < interactions.length; i += MAP_BATCH_SIZE) {
    batches.push(interactions.slice(i, i + MAP_BATCH_SIZE));
  }

  const results: string[] = new Array(batches.length);

  // Process in windows of MAP_CONCURRENCY
  for (let start = 0; start < batches.length; start += MAP_CONCURRENCY) {
    const window = batches.slice(start, start + MAP_CONCURRENCY);
    const settled = await Promise.all(
      window.map((batch, j) => mapBatch(batch, question, start + j, batches.length))
    );
    settled.forEach((r, j) => { results[start + j] = r; });
  }

  return results;
}

/** Reduce phase: synthesise all per-batch summaries into a final answer. */
async function reduce(
  summaries: string[],
  messages: { role: 'user' | 'assistant'; content: string }[],
  totalTranscripts: number,
  totalDeals: number,
): Promise<string> {
  const combinedSummaries = summaries.join('\n\n══════════════\n\n');

  const systemPrompt = `You are an expert sales analyst AI for Anrok. Answer directly and concisely.

Pre-extracted bullet summaries from ${totalTranscripts} transcripts across ${totalDeals} deal(s) — already filtered for relevance:

${combinedSummaries}

Instructions:
- Lead with the direct answer, then supporting evidence
- Group findings by theme, not by call
- Use bullet points; skip calls marked SKIP
- Reference deal names where it adds clarity
- No preamble, no "based on the transcripts" filler`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });

  return response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');
}

// ─── route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    filters: DealQueryFilters;
    messages: { role: 'user' | 'assistant'; content: string }[];
  };

  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { filters, messages } = body;
  if (!messages?.length) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
  }

  const userQuestion = messages[messages.length - 1].content;

  try {
    // Count total matching interactions
    const allInteractions = await getAllFilteredInteractions(filters ?? {});
    const totalTranscripts = allInteractions.length;

    if (totalTranscripts === 0) {
      return NextResponse.json({ content: 'No transcripts match the current filters.', mode: 'direct' });
    }

    if (totalTranscripts <= MAX_TRANSCRIPTS_DIRECT) {
      // ── Direct mode: pass full transcripts ──────────────────────────────────
      const context = await buildChatContext(filters ?? {});

      const systemPrompt = `You are an expert sales analyst AI for Anrok. Answer directly and concisely — no preamble.

${context}

- Lead with the direct answer
- Use bullet points for lists; group by theme not by call
- Reference specific deals/calls only where it adds clarity
- Skip any "based on the transcripts" filler`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('');

      return NextResponse.json({ content: text, mode: 'direct', totalTranscripts });

    } else {
      // ── Map-reduce mode ─────────────────────────────────────────────────────
      const uniqueDeals = new Set(allInteractions.map(i => i.deal_name)).size;

      // Map: summarise each batch of transcripts relative to the question
      const summaries = await mapAllTranscripts(allInteractions, userQuestion);

      // Reduce: synthesise summaries into a final answer
      const text = await reduce(summaries, messages, totalTranscripts, uniqueDeals);

      return NextResponse.json({
        content: text,
        mode: 'map-reduce',
        totalTranscripts,
        batchCount: summaries.length,
      });
    }

  } catch (err) {
    console.error('[POST /api/chat]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Chat failed' },
      { status: 500 }
    );
  }
}
