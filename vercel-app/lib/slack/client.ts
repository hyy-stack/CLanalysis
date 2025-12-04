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
   * @returns Slack message timestamp
   */
  async postAnalysis(deal: Deal, analysis: Analysis): Promise<string> {
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
    
    // Post main message
    const mainMessage = await this.client.chat.postMessage({
      channel: this.channelId,
      text: `${emoji} Analysis: ${deal.name}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} ${deal.name}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `CRM ID: ${deal.crm_id} | Stage: *${deal.stage}* | ${deal.amount ? `$${deal.amount.toLocaleString()}` : 'Amount TBD'}`,
            },
          ],
        },
      ],
    });
    
    const threadTs = mainMessage.ts!;
    
    // Post detailed analysis in thread
    await this.postThreadedAnalysis(threadTs, analysis, deal);
    
    console.log('[Slack] Analysis posted to thread:', threadTs);
    
    return threadTs;
  }

  /**
   * Post detailed analysis in thread
   */
  private async postThreadedAnalysis(
    threadTs: string,
    analysis: Analysis,
    deal: Deal
  ): Promise<void> {
    const isActiveDeal = deal.stage === 'active' || deal.stage === 'in_progress';
    
    // Build blocks for threaded message
    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Executive Summary*\n${analysis.exec_summary}`,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${isActiveDeal ? 'Recommended Next Steps' : 'Key Learnings'}*\n${analysis.next_steps}`,
        },
      },
    ];
    
    // Add deal health score if available (for active deals)
    if (analysis.details?.sections?.['Overall Deal Health Score']) {
      blocks.unshift({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Deal Health Score*\n${analysis.details.sections['Overall Deal Health Score']}`,
        },
      });
    }
    
    await this.client.chat.postMessage({
      channel: this.channelId,
      thread_ts: threadTs,
      text: 'Analysis Details',
      blocks,
    });
    
    // Post full analysis as a file attachment for detailed review
    if (analysis.details?.fullText) {
      await this.client.files.uploadV2({
        channel_id: this.channelId,
        thread_ts: threadTs,
        file: Buffer.from(analysis.details.fullText),
        filename: `${deal.name.replace(/[^a-z0-9]/gi, '-')}-analysis.md`,
        title: 'Full Analysis',
        initial_comment: '📄 Complete detailed analysis',
      });
    }
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

