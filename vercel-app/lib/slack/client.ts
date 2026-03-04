import { WebClient } from '@slack/web-api';
import type { Analysis, Deal } from '@/types/database';

/**
 * Slack API client for posting analysis results
 */

export class SlackClient {
  private client: WebClient;
  private channelId: string;
  
  constructor(botToken: string, channelId: string) {
    this.client = new WebClient(botToken);
    this.channelId = channelId;
  }

  /**
   * Post analysis to Slack channel with threaded details
   * @param deal - The deal being analyzed
   * @param analysis - The analysis results
   * @param interactions - All interactions (calls/emails) for context
   * @param manualEmails - Manual emails for context
   * @param channelOverride - Optional channel ID to post to instead of default
   * @returns Slack message timestamp
   */
  async postAnalysis(
    deal: Deal,
    analysis: Analysis,
    interactions: any[] = [],
    manualEmails: any[] = [],
    channelOverride?: string
  ): Promise<string> {
    const targetChannel = channelOverride || this.channelId;
    console.log('[Slack] Posting analysis for deal:', deal.name, 'to channel:', targetChannel);

    // Check for excluded interactions and emails
    const { getExcludedInteractionsForDeal, getExcludedManualEmailsForDeal } = await import('@/lib/db/client');
    const excludedInteractions = await getExcludedInteractionsForDeal(deal.id);
    const excludedEmails = await getExcludedManualEmailsForDeal(deal.id);
    const excludedCount = excludedInteractions.length + excludedEmails.length;
    
    // Extract health score from analysis
    const healthScore = this.extractHealthScore(analysis);
    
    // Determine emoji based on deal stage and health score
    let emoji = '📊';
    if (deal.stage === 'active' || deal.stage === 'in_progress') {
      if (healthScore !== null) {
        emoji = healthScore >= 7 ? '🟢' : healthScore >= 5 ? '🟡' : '🔴';
      } else {
        emoji = '🎯';
      }
    } else if (deal.stage === 'closed_lost') {
      emoji = '📉';
    } else if (deal.stage === 'closed_won') {
      emoji = '🎉';
    }
    
    // Build main message blocks
    const mainBlocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${deal.name}`,
        },
      },
    ];
    
    // Add deal details with health score in main message
    const dealFields: any[] = [
      {
        type: 'mrkdwn',
        text: `*Stage*\n${this.formatStage(deal.stage)}`,
      },
      ...(deal.owner_name ? [{
        type: 'mrkdwn',
        text: `*Owner*\n${deal.owner_name}`,
      }] : []),
      {
        type: 'mrkdwn',
        text: `*Type*\n${deal.opportunity_type || 'Unknown'}`,
      },
      {
        type: 'mrkdwn',
        text: `*Value*\n${deal.amount ? `${deal.currency || '$'}${deal.amount.toLocaleString()}` : 'TBD'}`,
      },
      ...(deal.arr ? [{
        type: 'mrkdwn',
        text: `*ARR*\n$${deal.arr.toLocaleString()}`,
      }] : []),
      ...(deal.role_segment ? [{
        type: 'mrkdwn',
        text: `*Segment*\n${deal.role_segment}`,
      }] : []),
    ];
    
    // Add health score to main message for non-closed deals
    const isActiveDeal = !['closed_lost', 'closed_won', 'closed-lost', 'closed-won'].includes(deal.stage.toLowerCase());
    
    if (healthScore !== null && isActiveDeal) {
      dealFields.push({
        type: 'mrkdwn',
        text: `*Health Score*\n${this.getHealthIndicator(healthScore)} *${healthScore}/10* ${this.getRiskLevel(healthScore)}`,
      });
    }
    
    dealFields.push({
      type: 'mrkdwn',
      text: `*CRM ID*\n\`${deal.crm_id}\``,
    });
    
    mainBlocks.push({
      type: 'section',
      fields: dealFields,
    });
    
    // Add action buttons to main message
    const mainActions: any[] = [];
    
    // Show Interactions button (interactive - posts to thread when clicked)
    mainActions.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '📅 Show Interactions',
      },
      action_id: 'show_interactions',
      value: deal.id, // Pass deal ID so interaction handler can fetch data
    });
    
    // Download Complete Report button (interactive - posts full analysis when clicked)
    mainActions.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '📥 Download Report',
      },
      action_id: 'download_full_analysis',
      value: deal.id,
    });
    
    // Show Excluded Interactions button (only if there are excluded interactions)
    if (excludedCount > 0) {
      mainActions.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: `🗑️ Show Excluded (${excludedCount})`,
        },
        action_id: 'show_excluded',
        value: deal.id,
      });
    }
    
    // Re-run Analysis button
    mainActions.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '🔄 Re-run Analysis',
      },
      action_id: 'rerun_analysis',
      value: deal.id,
      confirm: {
        title: {
          type: 'plain_text',
          text: 'Re-run Analysis?',
        },
        text: {
          type: 'mrkdwn',
          text: 'This will create a new analysis thread with the current set of interactions.',
        },
        confirm: {
          type: 'plain_text',
          text: 'Re-run',
        },
        deny: {
          type: 'plain_text',
          text: 'Cancel',
        },
      },
    });
    
    // View in Salesforce button if applicable
    const crmUrl = this.getCrmUrl(deal.crm_id);
    if (crmUrl) {
      mainActions.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '🔗 Open in Salesforce',
        },
        url: crmUrl,
        style: 'primary',
      });
    }
    
    mainBlocks.push({
      type: 'actions',
      elements: mainActions,
    });
    
    // Add a subtle divider
    mainBlocks.push({ type: 'divider' });
    
    // Add analysis timestamp - use analysis.created_at if available, otherwise current time
    const analysisTime = analysis.created_at 
      ? new Date(analysis.created_at).toLocaleString('en-US', { 
          timeZone: 'America/Los_Angeles', // Use Pacific timezone
          dateStyle: 'short',
          timeStyle: 'short'
        })
      : new Date().toLocaleString('en-US', { 
          timeZone: 'America/Los_Angeles',
          dateStyle: 'short',
          timeStyle: 'short'
        });
    
    mainBlocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🤖 Analysis completed ${analysisTime} | View thread for details ⬇️`,
        },
      ],
    });
    
    // Post main message
    const mainMessage = await this.client.chat.postMessage({
      channel: targetChannel,
      text: `${emoji} Analysis: ${deal.name}`,
      blocks: mainBlocks,
    });
    
    const threadTs = mainMessage.ts!;
    
    console.log('[Slack] Main message posted, thread_ts:', threadTs);
    
    // Post detailed analysis in thread
    try {
      await this.postThreadedAnalysis(threadTs, analysis, deal, targetChannel);
      console.log('[Slack] Thread details posted successfully');
      
      // Don't auto-post interactions - let users click "View Deal Data" button instead
      // if (interactions.length > 0 || manualEmails.length > 0) {
      //   await this.postInteractionsTimeline(threadTs, interactions, manualEmails);
      // }
    } catch (error) {
      console.error('[Slack] Failed to post thread details:', error);
      // Post a simple fallback message
      await this.client.chat.postMessage({
        channel: targetChannel,
        thread_ts: threadTs,
        text: `Analysis complete but detailed view failed. Executive Summary: ${analysis.exec_summary.substring(0, 500)}`,
      });
    }
    
    console.log('[Slack] Analysis posted to thread:', threadTs);
    
    return threadTs;
  }

  /**
   * Post detailed analysis in thread with enhanced Block Kit formatting
   * Order: Executive Summary -> Deal Health -> Key Learnings/Next Steps
   */
  private async postThreadedAnalysis(
    threadTs: string,
    analysis: Analysis,
    deal: Deal,
    targetChannel: string
  ): Promise<void> {
    const isActiveDeal = deal.stage === 'active' || deal.stage === 'in_progress';
    
    // Extract health score if available
    let healthScore = null;
    
    if (analysis.details?.sections?.['Overall Deal Health Score']) {
      const scoreText = analysis.details.sections['Overall Deal Health Score'];
      const match = scoreText.match(/(\d+)\/10/);
      if (match) {
        healthScore = parseInt(match[1]);
      }
    }
    
    // 1. POST EXECUTIVE SUMMARY FIRST (in chunks if needed)
    // Use plain text messages to avoid Slack's "See more" auto-collapse behavior
    let summaryText = analysis.exec_summary
      .replace(/^#+\s+/gm, '') // Remove # headers
      .replace(/\*\*([^*]+)\*\*/g, '*$1*') // Convert **bold** to *bold*
      .trim();
    
    // Post Executive Summary header
    await this.client.chat.postMessage({
      channel: targetChannel,
      thread_ts: threadTs,
      text: '*📋 Executive Summary*',
    });
    
    // Post summary as plain text messages in 3000 char chunks
    // While Slack allows 40k chars, 3k is safer for display compatibility across clients
    // Use plain text (no blocks) to completely avoid any truncation or "See more" behavior
    const MAX_MESSAGE_TEXT = 3000; // Safe chunk size for reliable display
    let remaining = summaryText;
    let summaryMessageNum = 1;
    
    while (remaining.length > 0) {
      const chunk = remaining.substring(0, MAX_MESSAGE_TEXT);
      remaining = remaining.substring(MAX_MESSAGE_TEXT);
      
      // Post as plain text message ONLY - no blocks at all
      // This ensures full text is displayed without any truncation
      await this.client.chat.postMessage({
        channel: targetChannel,
        thread_ts: threadTs,
        text: chunk, // Plain text only - no blocks
      });
      
      summaryMessageNum++;
    }
    
    console.log('[Slack] Posted executive summary in', summaryMessageNum - 1, 'message(s), total length:', summaryText.length);
    
    // 2. POST DEAL HEALTH SCORE (if available for active deals)
    if (healthScore !== null && isActiveDeal) {
      await this.client.chat.postMessage({
        channel: targetChannel,
        thread_ts: threadTs,
        text: `Deal Health Score: ${healthScore}/10`,
        blocks: [
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Deal Health Score*\n:large_${this.getScoreEmoji(healthScore)}_square: *${healthScore}/10*`,
              },
              {
                type: 'mrkdwn',
                text: `*Risk Level*\n${this.getRiskLevel(healthScore)}`,
              },
            ],
          },
        ],
      });
    }
    
    // 3. POST KEY LEARNINGS / NEXT STEPS LAST
    // Use plain text messages to avoid Slack's "See more" auto-collapse behavior
    let nextStepsText = analysis.next_steps
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/\*\*([^*]+)\*\*/g, '*$1*') // Convert markdown bold to Slack bold
      .trim();
    
    // Post header
    const nextStepsHeader = `*🎯 Critical Next Steps*`;
    await this.client.chat.postMessage({
      channel: targetChannel,
      thread_ts: threadTs,
      text: nextStepsHeader,
    });
    
    // Post Next Steps as plain text messages in 3000 char chunks
    // Reuse MAX_MESSAGE_TEXT from above
    remaining = nextStepsText;
    let nextStepsMessageNum = 1;
    
    while (remaining.length > 0) {
      const chunk = remaining.substring(0, MAX_MESSAGE_TEXT);
      remaining = remaining.substring(MAX_MESSAGE_TEXT);
      
      // Post as plain text message ONLY - no blocks at all
      // This ensures full text is displayed without any truncation
      await this.client.chat.postMessage({
        channel: targetChannel,
        thread_ts: threadTs,
        text: chunk, // Plain text only - no blocks
      });
      
      nextStepsMessageNum++;
    }
    
    console.log('[Slack] Posted next steps in', nextStepsMessageNum - 1, 'message(s), total length:', nextStepsText.length);
    
    console.log('[Slack] Posted analysis thread: Executive Summary -> Deal Health -> Next Steps');
  }

  /**
   * Extract health score from analysis
   */
  private extractHealthScore(analysis: Analysis): number | null {
    // Try to find score in details.sections first
    if (analysis.details?.sections?.['Overall Deal Health Score']) {
      const scoreText = analysis.details.sections['Overall Deal Health Score'];
      const match = scoreText.match(/(\d+)\/10/);
      if (match) return parseInt(match[1]);
    }
    
    // Fallback: look for score pattern in execSummary or full text
    const textToSearch = analysis.details?.fullText || analysis.exec_summary || '';
    const match = textToSearch.match(/Overall Deal Health Score:\s*(\d+)\/10/i);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Get health indicator emoji (colored circle)
   */
  private getHealthIndicator(score: number): string {
    if (score >= 8) return '🟢';
    if (score >= 6) return '🟡';
    if (score >= 4) return '🟠';
    return '🔴';
  }

  /**
   * Get emoji for health score
   */
  private getScoreEmoji(score: number): string {
    if (score >= 8) return 'green';
    if (score >= 6) return 'yellow';
    if (score >= 4) return 'orange';
    return 'red';
  }

  /**
   * Get risk level text
   */
  private getRiskLevel(score: number): string {
    if (score >= 8) return '✅ Low Risk';
    if (score >= 6) return '⚠️ Medium Risk';
    if (score >= 4) return '🔶 High Risk';
    return '🚨 Critical Risk';
  }

  /**
   * Truncate text to fit Slack limits
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Post interactions timeline in thread
   */
  private async postInteractionsTimeline(
    threadTs: string,
    interactions: any[],
    manualEmails: any[],
    targetChannel: string
  ): Promise<void> {
    // Combine all interactions
    const allItems = [
      ...interactions.map(i => ({
        type: i.type === 'call' ? '📞 Call' : '📧 Email',
        title: i.title || 'Untitled',
        timestamp: new Date(i.timestamp),
        duration: i.duration,
      })),
      ...manualEmails.map(e => ({
        type: '📧 Email',
        title: e.subject,
        timestamp: new Date(e.timestamp),
        duration: null,
      })),
    ];
    
    allItems.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    if (allItems.length === 0) return;
    
    // Build timeline text
    const timeline = allItems.map((item, idx) => {
      const date = item.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const time = item.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      let line = `${idx + 1}. ${item.type}: *${item.title}*\n    ${date} at ${time}`;
      
      if (item.duration) {
        const minutes = Math.floor(item.duration / 60);
        line += ` • ${minutes} min`;
      }
      
      return line;
    }).join('\n\n');
    
    // Count calls and emails
    const calls = allItems.filter(i => i.type === '📞 Call').length;
    const emails = allItems.filter(i => i.type === '📧 Email').length;
    
    await this.client.chat.postMessage({
      channel: targetChannel,
      thread_ts: threadTs,
      text: 'Interaction Timeline',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📅 Interaction Timeline',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: timeline,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `📊 Total: ${calls} call${calls !== 1 ? 's' : ''}, ${emails} email${emails !== 1 ? 's' : ''}`,
            },
          ],
        },
      ],
    });
    
    console.log('[Slack] Interactions timeline posted');
  }

  /**
   * Format stage with emoji
   */
  private formatStage(stage: string): string {
    const stageMap: Record<string, string> = {
      'active': '🟢 Active',
      'in_progress': '🟢 In Progress',
      'closed_won': '🎉 Closed Won',
      'closed_lost': '📉 Closed Lost',
      'stalled': '⏸️ Stalled',
    };
    return stageMap[stage] || stage;
  }

  /**
   * Get CRM URL from CRM ID
   */
  private getCrmUrl(crmId: string): string | null {
    // Salesforce opportunity IDs start with '006'
    if (crmId.startsWith('006')) {
      // Assuming standard Salesforce URL - adjust for your instance
      return `https://anrok.lightning.force.com/${crmId}`;
    }
    // Add other CRM patterns as needed
    return null;
  }


  /**
   * Post a CoM coaching digest to the private coaching Slack channel.
   * Mirrors the postAnalysis pattern: Block Kit summary as the main message,
   * full digest posted in thread as plain text.
   *
   * @param dealName  - Name of the deal
   * @param repName   - Name of the AE / deal owner
   * @param callTitle - Title of the Gong call
   * @param callDate  - Timestamp of the call
   * @param digest    - The Slack-ready coaching digest (< 300 words, pre-formatted)
   * @param sfStage   - Salesforce StageName (optional)
   * @returns Slack thread timestamp
   */
  async postCoachingDigest(
    dealName: string,
    repName: string | null,
    callTitle: string | null,
    callDate: Date,
    digest: string,
    sfStage?: string | null,
    sfOpportunityUrl?: string | null,
  ): Promise<string> {
    console.log(`[Slack] Posting coaching digest for "${dealName}" to channel ${this.channelId}`);

    const dateStr = callDate.toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const analysisTime = new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'short',
      timeStyle: 'short',
    });

    // Build fields for the summary block
    const fields: any[] = [];
    if (repName) fields.push({ type: 'mrkdwn', text: `*Rep*\n${repName}` });
    if (callTitle) fields.push({ type: 'mrkdwn', text: `*Call*\n${callTitle}` });
    fields.push({ type: 'mrkdwn', text: `*Date*\n${dateStr}` });
    if (sfStage) fields.push({ type: 'mrkdwn', text: `*SF Stage*\n${sfStage}` });

    const mainBlocks: any[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🎯 CoM Coaching: ${dealName}` },
      },
      {
        type: 'section',
        fields,
      },
    ];

    if (sfOpportunityUrl) {
      mainBlocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '🔗 Open in Salesforce' },
            url: sfOpportunityUrl,
            style: 'primary',
          },
        ],
      });
    }

    mainBlocks.push(
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🤖 Coaching analysis completed ${analysisTime} | View thread for details ⬇️`,
          },
        ],
      },
    );

    // Post main message
    const mainMessage = await this.client.chat.postMessage({
      channel: this.channelId,
      text: `🎯 CoM Coaching: ${dealName}`,
      blocks: mainBlocks,
    });

    const threadTs = mainMessage.ts!;
    console.log('[Slack] Coaching header posted, thread_ts:', threadTs);

    // Post digest header in thread
    await this.client.chat.postMessage({
      channel: this.channelId,
      thread_ts: threadTs,
      text: '*🎯 Coaching Digest*',
    });

    // Post digest as plain text in thread (avoids Slack "See more" truncation)
    // Split at newline boundaries to avoid cutting mid-word or mid-markdown span
    const MAX_CHUNK = 3000;
    let remaining = digest
      .replace(/\*\*([^*]+)\*\*/g, '*$1*') // **bold** → *bold* for Slack
      .trim();

    while (remaining.length > 0) {
      const cutAt = remaining.length <= MAX_CHUNK
        ? remaining.length
        : (remaining.lastIndexOf('\n', MAX_CHUNK) > 0 ? remaining.lastIndexOf('\n', MAX_CHUNK) : MAX_CHUNK);
      const chunk = remaining.substring(0, cutAt);
      remaining = remaining.substring(cutAt).trimStart();
      await this.client.chat.postMessage({
        channel: this.channelId,
        thread_ts: threadTs,
        text: chunk,
      });
    }

    console.log('[Slack] Coaching digest posted to thread:', threadTs);
    return threadTs;
  }

  /**
   * Test Slack connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.client.auth.test();
      console.log('[Slack] Connected as:', result.user);
      return true;
    } catch (error) {
      console.error('[Slack] Connection failed:', error);
      return false;
    }
  }
}


