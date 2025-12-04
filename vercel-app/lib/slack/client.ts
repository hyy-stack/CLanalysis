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
   * @returns Slack message timestamp
   */
  async postAnalysis(
    deal: Deal, 
    analysis: Analysis,
    interactions: any[] = [],
    manualEmails: any[] = []
  ): Promise<string> {
    console.log('[Slack] Posting analysis for deal:', deal.name);
    
    // Determine emoji based on deal stage and analysis type
    let emoji = '📊';
    if (deal.stage === 'active' || deal.stage === 'in_progress') {
      emoji = '🎯';
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
    
    // Add deal details in a nice section
    const dealFields: any[] = [
      {
        type: 'mrkdwn',
        text: `*Stage*\n${this.formatStage(deal.stage)}`,
      },
      {
        type: 'mrkdwn',
        text: `*Value*\n${deal.amount ? `${deal.currency || '$'}${deal.amount.toLocaleString()}` : 'TBD'}`,
      },
    ];
    
    if (deal.account_name) {
      dealFields.push({
        type: 'mrkdwn',
        text: `*Account*\n${deal.account_name}`,
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
    
    // Add a subtle divider
    mainBlocks.push({ type: 'divider' });
    
    // Add analysis timestamp
    mainBlocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🤖 Analysis completed ${new Date().toLocaleString()} | Click below to view details ⬇️`,
        },
      ],
    });
    
    // Post main message
    const mainMessage = await this.client.chat.postMessage({
      channel: this.channelId,
      text: `${emoji} Analysis: ${deal.name}`,
      blocks: mainBlocks,
    });
    
    const threadTs = mainMessage.ts!;
    
    console.log('[Slack] Main message posted, thread_ts:', threadTs);
    
    // Post detailed analysis in thread
    try {
      await this.postThreadedAnalysis(threadTs, analysis, deal);
      console.log('[Slack] Thread details posted successfully');
      
      // Post interactions timeline if available
      if (interactions.length > 0 || manualEmails.length > 0) {
        await this.postInteractionsTimeline(threadTs, interactions, manualEmails);
      }
    } catch (error) {
      console.error('[Slack] Failed to post thread details:', error);
      // Post a simple fallback message
      await this.client.chat.postMessage({
        channel: this.channelId,
        thread_ts: threadTs,
        text: `Analysis complete but detailed view failed. Executive Summary: ${analysis.exec_summary.substring(0, 500)}`,
      });
    }
    
    console.log('[Slack] Analysis posted to thread:', threadTs);
    
    return threadTs;
  }

  /**
   * Post detailed analysis in thread with enhanced Block Kit formatting
   */
  private async postThreadedAnalysis(
    threadTs: string,
    analysis: Analysis,
    deal: Deal
  ): Promise<void> {
    const isActiveDeal = deal.stage === 'active' || deal.stage === 'in_progress';
    
    // Extract health score if available
    let healthScore = null;
    let healthColor = '#808080';
    
    if (analysis.details?.sections?.['Overall Deal Health Score']) {
      const scoreText = analysis.details.sections['Overall Deal Health Score'];
      const match = scoreText.match(/(\d+)\/10/);
      if (match) {
        healthScore = parseInt(match[1]);
        // Color coding: 8-10 green, 6-7 yellow, 4-5 orange, 1-3 red
        if (healthScore >= 8) healthColor = '#36a64f'; // green
        else if (healthScore >= 6) healthColor = '#ffcc00'; // yellow
        else if (healthScore >= 4) healthColor = '#ff9900'; // orange
        else healthColor = '#ff0000'; // red
      }
    }
    
    // Build enhanced blocks
    const blocks: any[] = [];
    
    // Health score with color indicator (for active deals)
    if (healthScore !== null) {
      blocks.push({
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
      });
      blocks.push({ type: 'divider' });
    }
    
    // Executive Summary with nice formatting
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📋 Executive Summary*\n${this.truncate(analysis.exec_summary, 2500)}`,
      },
    });
    
    blocks.push({ type: 'divider' });
    
    // Next Steps / Recommendations
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${isActiveDeal ? '🎯 Recommended Next Steps' : '💡 Key Learnings'}*\n${this.truncate(analysis.next_steps, 2500)}`,
      },
    });
    
    // Add action buttons
    blocks.push({ type: 'divider' });
    
    const actions: any[] = [];
    
    // Add CRM link button
    const crmUrl = this.getCrmUrl(deal.crm_id);
    if (crmUrl) {
      actions.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '🔗 View in Salesforce',
        },
        url: crmUrl,
        style: 'primary',
      });
    }
    
    // Add view deal details button (API endpoint)
    actions.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '📊 View Deal Data',
      },
      url: `https://anrok-deal-analyzer.vercel.app/api/view-deal?crmId=${encodeURIComponent(deal.crm_id)}`,
    });
    
    if (actions.length > 0) {
      blocks.push({
        type: 'actions',
        elements: actions,
      });
    }
    
    // Post the formatted message
    console.log('[Slack] Posting thread with', blocks.length, 'blocks');
    
    const threadMessage = await this.client.chat.postMessage({
      channel: this.channelId,
      thread_ts: threadTs,
      text: 'Analysis Details',
      blocks,
    });
    
    console.log('[Slack] Thread message posted:', threadMessage.ts);
    
    // Post full analysis as a file attachment
    if (analysis.details?.fullText) {
      console.log('[Slack] Uploading full analysis file');
      await this.client.files.uploadV2({
        channel_id: this.channelId,
        thread_ts: threadTs,
        file: Buffer.from(analysis.details.fullText),
        filename: `${deal.name.replace(/[^a-z0-9]/gi, '-')}-analysis.md`,
        title: '📊 Complete Analysis Report',
        initial_comment: '_Full detailed analysis with all sections_',
      });
      console.log('[Slack] File uploaded');
    }
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

