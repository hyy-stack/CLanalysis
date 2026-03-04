import { readFile } from 'fs/promises';
import { join } from 'path';
import { ClaudeClient } from '@/lib/claude/client';

/**
 * Two-stage CoM coaching pipeline.
 *
 * Stage 1 (runStage1): Runs com-discovery-coaching.md against the call transcript
 *   and Salesforce field context. Returns full coaching markdown.
 *
 * Stage 2 (runStage2): Runs com-rep-digest.md against the Stage 1 output.
 *   Returns a Slack-ready digest (< 300 words) and system-facing bot feedback,
 *   split on the ---BOT-FEEDBACK--- delimiter.
 */

// ── Prompt loading ───────────────────────────────────────────────────────────

/**
 * Load a coaching prompt and split it into system / user sections.
 * Prompts follow the format:
 *   # System Prompt
 *   <system content>
 *   # User Prompt
 *   <user content>
 */
async function loadCoachingPrompt(filename: string): Promise<{ system: string; user: string }> {
  const promptsDir = join(process.cwd(), 'prompts');
  const content = await readFile(join(promptsDir, filename), 'utf-8');

  const systemMatch = content.match(/^# System Prompt\s*\n([\s\S]*?)(?=\n# User Prompt)/m);
  const userMatch = content.match(/^# User Prompt\s*\n([\s\S]*)$/m);

  if (!systemMatch || !userMatch) {
    throw new Error(`[Coaching] Prompt ${filename} missing # System Prompt or # User Prompt sections`);
  }

  return {
    system: systemMatch[1].trim(),
    user: userMatch[1].trim(),
  };
}

// ── Discovery context loading ────────────────────────────────────────────────

/**
 * Load the Anrok discovery context reference document.
 * Injected as {{DISCOVERY_CONTEXT}} into Stage 1.
 */
async function loadDiscoveryContext(): Promise<string> {
  const promptsDir = join(process.cwd(), 'prompts');
  return readFile(join(promptsDir, 'anrok-discovery-context.md'), 'utf-8');
}

// ── Variable substitution ────────────────────────────────────────────────────

type PromptVars = {
  TRANSCRIPT?: string;
  DEAL_INFO?: string;
  STAGE_CONTEXT?: string;
  REP_NAME?: string;
  COACHING_OUTPUT?: string;
  BUYER_SCENARIO?: string;
  DISCOVERY_CONTEXT?: string;
};

function fillCoachingPrompt(template: string, vars: PromptVars): string {
  return template
    .replace(/\{\{TRANSCRIPT\}\}/g, vars.TRANSCRIPT || '')
    .replace(/\{\{DEAL_INFO\}\}/g, vars.DEAL_INFO || '')
    .replace(/\{\{STAGE_CONTEXT\}\}/g, vars.STAGE_CONTEXT || '')
    .replace(/\{\{REP_NAME\}\}/g, vars.REP_NAME ? `**Rep:** ${vars.REP_NAME}` : '')
    .replace(/\{\{COACHING_OUTPUT\}\}/g, vars.COACHING_OUTPUT || '')
    .replace(/\{\{BUYER_SCENARIO\}\}/g, vars.BUYER_SCENARIO || 'Unknown')
    .replace(/\{\{DISCOVERY_CONTEXT\}\}/g, vars.DISCOVERY_CONTEXT || '');
}

// ── Transcript formatting ────────────────────────────────────────────────────

/**
 * Format a raw transcript object (stored in Blob as JSON) into readable text
 * for injection into the coaching prompt.
 */
export function formatTranscriptForCoaching(transcript: any): string {
  if (!transcript || !transcript.turns || transcript.turns.length === 0) {
    return '*No transcript available*';
  }

  return transcript.turns.map((turn: any) => {
    const minutes = Math.floor((turn.timestamp || 0) / 60);
    const seconds = (turn.timestamp || 0) % 60;
    const time = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    const roleLabel =
      turn.speakerRole === 'customer' ? 'BUYER' :
      turn.speakerRole === 'sales'    ? 'REP' : 'OTHER';
    return `[${time}] ${roleLabel} (${turn.speaker}): ${turn.text}`;
  }).join('\n');
}

// ── Stage 1 ──────────────────────────────────────────────────────────────────

export interface Stage1Result {
  coachingOutput: string; // raw markdown from Claude
}

/**
 * Run the discovery coaching prompt (Stage 1).
 * Returns the full coaching output as raw markdown.
 */
export async function runStage1(
  transcript: string,
  dealInfo: string,
  stageContext: string,
  repName: string | null,
  client: ClaudeClient,
  buyerScenario: string = 'Unknown'
): Promise<Stage1Result> {
  console.log('[Coaching Stage 1] Loading prompt and discovery context...');
  const [prompt, discoveryContext] = await Promise.all([
    loadCoachingPrompt('com-discovery-coaching.md'),
    loadDiscoveryContext(),
  ]);

  const userPrompt = fillCoachingPrompt(prompt.user, {
    TRANSCRIPT: transcript,
    DEAL_INFO: dealInfo,
    STAGE_CONTEXT: stageContext,
    REP_NAME: repName || undefined,
    BUYER_SCENARIO: buyerScenario,
    DISCOVERY_CONTEXT: discoveryContext,
  });

  console.log(`[Coaching Stage 1] Prompt ready — system: ${prompt.system.length} chars, user: ${userPrompt.length} chars, scenario: ${buyerScenario}`);

  const coachingOutput = await client.analyzeRaw(prompt.system, userPrompt);

  console.log(`[Coaching Stage 1] Complete — output: ${coachingOutput.length} chars`);
  return { coachingOutput };
}

// ── Stage 2 ──────────────────────────────────────────────────────────────────

export interface Stage2Result {
  slackDigest: string; // Part 1 — rep-facing, < 300 words
  botFeedback: string; // Part 2 — system-facing prompt improvement notes
  fullResponse: string;
}

const BOT_FEEDBACK_DELIMITER = '---BOT-FEEDBACK---';

/**
 * Run the rep digest prompt (Stage 2).
 * Consumes Stage 1 output + original transcript.
 * Returns slackDigest and botFeedback parsed from Claude's response.
 */
export async function runStage2(
  transcript: string,
  stage1Output: string,
  repName: string | null,
  client: ClaudeClient,
  buyerScenario: string = 'Unknown'
): Promise<Stage2Result> {
  console.log('[Coaching Stage 2] Loading prompt...');
  const prompt = await loadCoachingPrompt('com-rep-digest.md');

  const userPrompt = fillCoachingPrompt(prompt.user, {
    TRANSCRIPT: transcript,
    COACHING_OUTPUT: stage1Output,
    REP_NAME: repName || undefined,
    BUYER_SCENARIO: buyerScenario,
  });

  console.log(`[Coaching Stage 2] Prompt ready — system: ${prompt.system.length} chars, user: ${userPrompt.length} chars`);

  const fullResponse = await client.analyzeRaw(prompt.system, userPrompt);

  console.log(`[Coaching Stage 2] Complete — response: ${fullResponse.length} chars`);

  // Split on the delimiter that the prompt instructs Claude to insert
  const delimiterIndex = fullResponse.indexOf(BOT_FEEDBACK_DELIMITER);

  let slackDigest: string;
  let botFeedback: string;

  if (delimiterIndex === -1) {
    console.warn('[Coaching Stage 2] Delimiter not found — treating full response as slack digest');
    slackDigest = fullResponse.trim();
    botFeedback = '';
  } else {
    slackDigest = fullResponse.substring(0, delimiterIndex).trim();
    botFeedback = fullResponse.substring(delimiterIndex + BOT_FEEDBACK_DELIMITER.length).trim();
  }

  // Strip the "PART 1 — SLACK DIGEST" header if Claude included it
  slackDigest = slackDigest.replace(/^\*\*PART 1[^*]*\*\*\s*\n*/i, '').trim();
  botFeedback = botFeedback.replace(/^\*\*PART 2[^*]*\*\*\s*\n*/i, '').trim();

  console.log(`[Coaching Stage 2] Slack digest: ${slackDigest.length} chars, Bot feedback: ${botFeedback.length} chars`);

  return { slackDigest, botFeedback, fullResponse };
}
