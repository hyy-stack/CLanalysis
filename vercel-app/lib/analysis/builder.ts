import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Deal, Interaction, ManualEmail } from '@/types/database';
import { retrieveContent } from '@/lib/blob/storage';

/**
 * Build analysis context from interactions
 */

/**
 * Format a single interaction for the prompt
 */
async function formatInteraction(
  interaction: Interaction,
  index: number
): Promise<string> {
  const date = new Date(interaction.timestamp).toLocaleDateString();
  const type = interaction.type === 'call' ? '📞 CALL' : '📧 EMAIL';

  // Retrieve content from Blob
  const content = await retrieveContent(interaction.blob_url);

  let formatted = `\n## ${type} #${index + 1} - ${date}\n\n`;
  formatted += `**Title**: ${interaction.title || 'Untitled'}\n`;

  if (interaction.type === 'call' && interaction.duration) {
    formatted += `**Duration**: ${Math.floor(interaction.duration / 60)} minutes\n`;
  }

  // Include participants with titles for calls
  if (interaction.type === 'call' && interaction.participants) {
    const participants = Array.isArray(interaction.participants)
      ? interaction.participants
      : [];

    if (participants.length > 0) {
      formatted += `\n**Participants**:\n`;
      participants.forEach((p: any) => {
        const affiliation = p.affiliation === 'External' ? '(Customer)' : '(Anrok)';
        const title = p.title ? ` - ${p.title}` : '';
        formatted += `- ${p.name}${title} ${affiliation}\n`;
      });
    }
  }

  formatted += `\n**Content**:\n\n`;
  
  if (interaction.type === 'call') {
    // Parse transcript from JSON
    try {
      const transcript = JSON.parse(content);
      formatted += formatTranscript(transcript);
    } catch {
      formatted += content;
    }
  } else {
    // Email body
    formatted += content;
  }
  
  return formatted;
}

/**
 * Format transcript for display
 */
function formatTranscript(transcript: any): string {
  if (!transcript || !transcript.turns || transcript.turns.length === 0) {
    return '*No transcript available*';
  }
  
  return transcript.turns.map((turn: any) => {
    const minutes = Math.floor(turn.timestamp / 60);
    const seconds = turn.timestamp % 60;
    const time = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    const roleLabel = turn.speakerRole === 'customer' ? '👤 CUSTOMER' : 
                      turn.speakerRole === 'sales' ? '💼 SALES' : '🔹 OTHER';
    
    return `[${time}] ${roleLabel} - ${turn.speaker}: ${turn.text}`;
  }).join('\n');
}

/**
 * Build chronological context from all interactions
 */
export async function buildContext(
  interactions: Interaction[],
  manualEmails: ManualEmail[]
): Promise<string> {
  // Combine and sort all interactions chronologically
  const allItems: Array<{ type: 'interaction' | 'email', data: any, timestamp: Date }> = [
    ...interactions.map(i => ({ type: 'interaction' as const, data: i, timestamp: new Date(i.timestamp) })),
    ...manualEmails.map(e => ({ type: 'email' as const, data: e, timestamp: new Date(e.timestamp) })),
  ];
  
  allItems.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  let context = '';
  
  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    
    if (item.type === 'interaction') {
      context += await formatInteraction(item.data, i);
    } else {
      // Format manual email
      const email = item.data as ManualEmail;
      const date = new Date(email.timestamp).toLocaleDateString();
      const emailContent = await retrieveContent(email.blob_url);
      
      context += `\n## 📧 EMAIL #${i + 1} - ${date}\n\n`;
      context += `**Subject**: ${email.subject}\n`;
      context += `**From**: ${email.from_email}\n`;
      context += `**To**: ${email.to_email}\n\n`;
      context += emailContent;
    }
    
    context += '\n\n---\n';
  }
  
  return context;
}

/**
 * Format deal info for prompt
 */
export function formatDealInfo(deal: Deal): string {
  let info = `
**Deal Name**: ${deal.name}
**CRM ID**: ${deal.crm_id}
**Stage**: ${deal.stage}
**Account**: ${deal.account_name || 'N/A'}
**Value**: ${deal.amount ? `${deal.currency || '$'}${deal.amount.toLocaleString()}` : 'N/A'}`;

  if (deal.arr) {
    info += `\n**ARR**: $${deal.arr.toLocaleString()}`;
  }

  if (deal.role_segment) {
    info += `\n**Role Segment**: ${deal.role_segment}`;
  }

  return info.trim();
}

/**
 * Select appropriate prompt template based on deal stage
 */
export async function selectPrompt(stage: string): Promise<string> {
  const promptsDir = join(process.cwd(), 'prompts');
  
  let filename: string;
  
  if (stage === 'active' || stage === 'in_progress' || stage === 'open') {
    filename = 'active-deal-analysis.md';
  } else if (stage === 'closed_lost') {
    filename = 'deal-loss-analysis.md';
  } else if (stage === 'closed_won') {
    // Future: success analysis
    filename = 'active-deal-analysis.md'; // Fallback
  } else {
    filename = 'active-deal-analysis.md'; // Default fallback
  }
  
  const promptPath = join(promptsDir, filename);
  return readFile(promptPath, 'utf-8');
}

/**
 * Fill prompt template with deal info and context
 */
export function fillPrompt(
  template: string,
  dealInfo: string,
  context: string
): string {
  return template
    .replace(/\{\{DEAL_INFO\}\}/g, dealInfo)
    .replace(/\{\{CALL_TRANSCRIPTS\}\}/g, context);
}

/**
 * Load a specific prompt by name
 */
export async function loadPrompt(promptName: string): Promise<string> {
  const promptsDir = join(process.cwd(), 'prompts');
  const promptPath = join(promptsDir, promptName);
  return readFile(promptPath, 'utf-8');
}

