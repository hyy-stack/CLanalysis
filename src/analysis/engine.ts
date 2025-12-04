import { PromptLoader, fillPromptTemplate } from './prompt-loader.js';
import { FileLLMClient } from './llm-client.js';
import type { Deal, Call, Transcript } from '../types/common.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Format a deal for inclusion in a prompt
 */
function formatDealInfo(deal: Deal): string {
  return `
**Deal Name**: ${deal.name}
**Deal ID**: ${deal.id}
**Stage**: ${deal.stage}
**Account**: ${deal.accountName || 'N/A'}
**Value**: ${deal.value ? `${deal.currency || '$'}${deal.value.toLocaleString()}` : 'N/A'}
**Closed Date**: ${deal.closedDate || 'N/A'}
**Lost Reason**: ${deal.lostReason || 'Not specified'}
**Created Date**: ${deal.createdDate || 'N/A'}

**Key Participants**:
${deal.participants.map(p => `- ${p.name} (${p.role}) ${p.email ? `- ${p.email}` : ''}`).join('\n')}
  `.trim();
}

/**
 * Format a transcript turn for display
 */
function formatTranscriptTurn(turn: { speaker: string; speakerRole: string; timestamp: number; text: string }): string {
  const minutes = Math.floor(turn.timestamp / 60);
  const seconds = turn.timestamp % 60;
  const time = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const roleLabel = turn.speakerRole === 'customer' ? '👤 CUSTOMER' : 
                    turn.speakerRole === 'sales' ? '💼 SALES' : '🔹 OTHER';
  
  return `[${time}] ${roleLabel} - ${turn.speaker}: ${turn.text}`;
}

/**
 * Format call transcripts for inclusion in a prompt
 */
function formatCallTranscripts(calls: Call[], transcripts: Transcript[]): string {
  const transcriptMap = new Map(transcripts.map(t => [t.callId, t]));
  
  return calls.map((call, index) => {
    const transcript = transcriptMap.get(call.id);
    const callNumber = index + 1;
    const date = new Date(call.date).toLocaleDateString();
    const duration = `${Math.floor(call.duration / 60)} minutes`;
    
    let content = `
## Call #${callNumber} - ${date}

**Call ID**: ${call.id}
**Duration**: ${duration}
**Title**: ${call.title || 'Untitled'}

**Participants**:
${call.participants.map(p => `- ${p.name} (${p.role})`).join('\n')}
`;

    if (transcript && transcript.turns.length > 0) {
      content += '\n**Transcript**:\n\n';
      content += transcript.turns.map(turn => formatTranscriptTurn(turn)).join('\n');
    } else {
      content += '\n*No transcript available for this call*\n';
    }

    return content;
  }).join('\n\n---\n\n');
}

/**
 * Analysis engine orchestrates the analysis process
 */
export class AnalysisEngine {
  private promptLoader: PromptLoader;
  private llmClient: FileLLMClient;

  constructor(
    promptsDir: string,
    private readonly analysisOutputDir: string
  ) {
    this.promptLoader = new PromptLoader(promptsDir);
    this.llmClient = new FileLLMClient(analysisOutputDir);
  }

  /**
   * Analyze a deal using the appropriate prompt based on deal status
   */
  async analyzeDealLoss(
    deal: Deal,
    calls: Call[],
    transcripts: Transcript[]
  ): Promise<string> {
    const isActiveDeal = deal.stage === 'active' || deal.stage === 'in_progress' || deal.stage === 'open';
    
    if (isActiveDeal) {
      console.log(`\n[Analysis Engine] Starting active deal health analysis for: ${deal.name}`);
    } else {
      console.log(`\n[Analysis Engine] Starting deal loss analysis for: ${deal.name}`);
    }

    // Load the appropriate prompt template
    const template = isActiveDeal 
      ? await this.promptLoader.loadActiveDealAnalysisPrompt()
      : await this.promptLoader.loadDealLossAnalysisPrompt();

    // Format the data
    const dealInfo = formatDealInfo(deal);
    const callTranscripts = formatCallTranscripts(calls, transcripts);

    // Fill the template
    const prompt = fillPromptTemplate(template, {
      DEAL_INFO: dealInfo,
      CALL_TRANSCRIPTS: callTranscripts,
    });

    // Save the filled prompt
    const promptType = isActiveDeal ? 'active-deal-health' : 'deal-loss';
    const promptFilename = `${deal.id}-${promptType}-prompt.md`;
    const promptPath = path.join(this.analysisOutputDir, promptFilename);
    await fs.writeFile(promptPath, prompt, 'utf-8');

    console.log(`[Analysis Engine] Prompt saved to: ${promptPath}`);
    console.log(`[Analysis Engine] Calls analyzed: ${calls.length}`);
    console.log(`[Analysis Engine] Transcripts included: ${transcripts.length}`);

    return promptPath;
  }

  /**
   * Analyze customer sentiment using the customer sentiment prompt
   */
  async analyzeCustomerSentiment(
    deal: Deal,
    calls: Call[],
    transcripts: Transcript[]
  ): Promise<string> {
    console.log(`\n[Analysis Engine] Starting customer sentiment analysis for: ${deal.name}`);

    // Load the prompt template
    const template = await this.promptLoader.loadCustomerSentimentPrompt();

    // Format the data
    const dealInfo = formatDealInfo(deal);
    const callTranscripts = formatCallTranscripts(calls, transcripts);

    // Fill the template
    const prompt = fillPromptTemplate(template, {
      DEAL_INFO: dealInfo,
      CALL_TRANSCRIPTS: callTranscripts,
    });

    // Save the filled prompt
    const promptFilename = `${deal.id}-customer-sentiment-prompt.md`;
    const promptPath = path.join(this.analysisOutputDir, promptFilename);
    await fs.writeFile(promptPath, prompt, 'utf-8');

    console.log(`[Analysis Engine] Prompt saved to: ${promptPath}`);
    console.log(`[Analysis Engine] Calls analyzed: ${calls.length}`);
    console.log(`[Analysis Engine] Transcripts included: ${transcripts.length}`);

    return promptPath;
  }

  /**
   * Run both analyses for a deal
   */
  async analyzeAll(
    deal: Deal,
    calls: Call[],
    transcripts: Transcript[]
  ): Promise<{ dealAnalysisPrompt: string; sentimentPrompt: string }> {
    const dealAnalysisPrompt = await this.analyzeDealLoss(deal, calls, transcripts);
    const sentimentPrompt = await this.analyzeCustomerSentiment(deal, calls, transcripts);

    return {
      dealAnalysisPrompt,
      sentimentPrompt,
    };
  }

  /**
   * Generate a summary analysis report
   */
  async generateSummaryReport(deal: Deal, calls: Call[]): Promise<string> {
    const reportFilename = `${deal.id}-summary.md`;
    const reportPath = path.join(this.analysisOutputDir, reportFilename);

    const report = `
# Analysis Summary: ${deal.name}

## Deal Overview
- **Status**: ${deal.stage}
- **Value**: ${deal.value ? `${deal.currency || '$'}${deal.value.toLocaleString()}` : 'N/A'}
- **Closed Date**: ${deal.closedDate || 'N/A'}
- **Lost Reason**: ${deal.lostReason || 'Not specified'}

## Call Activity
- **Total Calls**: ${calls.length}
- **First Call**: ${calls.length > 0 ? new Date(calls[0].date).toLocaleDateString() : 'N/A'}
- **Last Call**: ${calls.length > 0 ? new Date(calls[calls.length - 1].date).toLocaleDateString() : 'N/A'}
- **Total Duration**: ${calls.reduce((sum, c) => sum + c.duration, 0) / 60} minutes

## Key Participants
${deal.participants.map(p => `- **${p.name}** (${p.role})`).join('\n')}

## Analysis Files Generated
- Deal Loss Analysis Prompt: \`${deal.id}-deal-loss-prompt.md\`
- Customer Sentiment Prompt: \`${deal.id}-customer-sentiment-prompt.md\`

## Next Steps
1. Review the generated prompts in this directory
2. Copy each prompt into your preferred LLM (GPT-4, Claude, etc.)
3. Save the LLM responses as markdown files
4. Use insights to improve future sales approaches

---
*Generated on ${new Date().toISOString()}*
    `.trim();

    await fs.writeFile(reportPath, report, 'utf-8');
    console.log(`\n[Analysis Engine] Summary report saved to: ${reportPath}`);

    return reportPath;
  }
}

