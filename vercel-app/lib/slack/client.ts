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
      {
        type: 'mrkdwn',
        text: `*Value*\n${deal.amount ? `${deal.currency || '$'}${deal.amount.toLocaleString()}` : 'TBD'}`,
      },
    ];
    
    // Add health score to main message for active deals
    if (healthScore !== null && (deal.stage === 'active' || deal.stage === 'in_progress')) {
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
    
    // Add analysis timestamp
    mainBlocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🤖 Analysis completed ${new Date().toLocaleString()} | View thread for details ⬇️`,
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
      
      // Don't auto-post interactions - let users click "View Deal Data" button instead
      // if (interactions.length > 0 || manualEmails.length > 0) {
      //   await this.postInteractionsTimeline(threadTs, interactions, manualEmails);
      // }
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
    
    // Executive Summary - strip markdown headers and format for Slack
    // Remove markdown headers (#, ##, ###) and convert to plain text with bold
    let summaryText = analysis.exec_summary
      .replace(/^#+\s+/gm, '') // Remove # headers
      .replace(/\*\*([^*]+)\*\*/g, '*$1*') // Convert **bold** to *bold*
      .trim();
    
    // Extract just the key assessment content (skip the headers)
    const contentMatch = summaryText.match(/Current Status[:\*\s]+(.+?)(?=\n\n|$)/s);
    const summaryPreview = contentMatch ? contentMatch[1].trim() : summaryText.substring(0, 300);
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📋 Executive Summary*\n${summaryPreview.substring(0, 300)}${summaryPreview.length > 300 ? '...' : ''}`,
      },
    });
    
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '_See file attachment below for complete analysis_',
        },
      ],
    });
    
    blocks.push({ type: 'divider' });
    
    // Next Steps / Recommendations - strip markdown formatting
    let nextStepsText = analysis.next_steps
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/\*\*([^*]+)\*\*/g, '*$1*') // Convert markdown bold to Slack bold
      .trim();
    
    // Show first 2-3 action items
    const lines = nextStepsText.split('\n').filter(l => l.trim());
    const preview = lines.slice(0, 5).join('\n');
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${isActiveDeal ? '🎯 Recommended Next Steps' : '💡 Key Learnings'}*\n${preview}${lines.length > 5 ? '\n...' : ''}`,
      },
    });
    
    if (lines.length > 5) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '_See file attachment for all recommendations_',
          },
        ],
      });
    }
    
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
    manualEmails: any[]
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
      channel: this.channelId,
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

