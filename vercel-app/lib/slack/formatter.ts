/**
 * Advanced Slack message formatting utilities
 * Using Block Kit for rich, interactive messages
 */

import type { Analysis, Deal } from '@/types/database';

/**
 * Create an enhanced analysis card with interactive elements
 */
export function createAnalysisCard(
  deal: Deal,
  analysis: Analysis,
  options: {
    includeActions?: boolean;
    includeMetrics?: boolean;
  } = {}
): any[] {
  const isActiveDeal = deal.stage === 'active' || deal.stage === 'in_progress';
  const blocks: any[] = [];

  // Extract health score
  const healthScore = extractHealthScore(analysis);
  
  // Header section with health indicator
  if (healthScore !== null && isActiveDeal) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${getHealthIndicator(healthScore)} Deal Health: ${healthScore}/10*`,
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📊 Details',
        },
        action_id: 'show_health_breakdown',
        value: analysis.id,
      },
    });
    blocks.push({ type: 'divider' });
  }
  
  // Key insights section
  const insights = extractKeyInsights(analysis);
  if (insights.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🔑 Key Insights*',
      },
    });
    
    insights.forEach(insight => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• ${insight}`,
        },
      });
    });
    
    blocks.push({ type: 'divider' });
  }
  
  // Executive summary (collapsible via overflow menu)
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*📋 Executive Summary*\n${truncate(analysis.exec_summary, 2000)}`,
    },
  });
  
  blocks.push({ type: 'divider' });
  
  // Next steps with checkboxes
  const nextSteps = formatNextSteps(analysis.next_steps);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*${isActiveDeal ? '🎯 Immediate Actions' : '💡 Key Learnings'}*\n${nextSteps}`,
    },
  });
  
  // Warning signs (for active deals)
  if (isActiveDeal && analysis.details?.sections?.['Warning Signs (Red Flags to Address)']) {
    const warnings = analysis.details.sections['Warning Signs (Red Flags to Address)'];
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🚨 Warning Signs*\n${truncate(warnings, 1000)}`,
      },
    });
  }
  
  // Positive indicators (for active deals)
  if (isActiveDeal && analysis.details?.sections?.['Positive Indicators (What\'s Going Well)']) {
    const positives = analysis.details.sections['Positive Indicators (What\'s Going Well)'];
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*✅ Positive Indicators*\n${truncate(positives, 1000)}`,
      },
    });
  }
  
  // Action buttons
  if (options.includeActions) {
    blocks.push({ type: 'divider' });
    
    const actionElements: any[] = [];
    
    // View in CRM button
    const crmUrl = getCrmUrl(deal.crm_id);
    if (crmUrl) {
      actionElements.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '🔗 View in Salesforce',
        },
        url: crmUrl,
        style: 'primary',
      });
    }
    
    // Re-analyze button (would need API endpoint)
    actionElements.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '🔄 Re-analyze',
      },
      action_id: 'reanalyze_deal',
      value: deal.id,
    });
    
    if (actionElements.length > 0) {
      blocks.push({
        type: 'actions',
        elements: actionElements,
      });
    }
  }
  
  return blocks;
}

/**
 * Extract health score from analysis
 */
function extractHealthScore(analysis: Analysis): number | null {
  if (!analysis.details?.sections?.['Overall Deal Health Score']) {
    return null;
  }
  
  const scoreText = analysis.details.sections['Overall Deal Health Score'];
  const match = scoreText.match(/(\d+)\/10/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Get health indicator emoji
 */
function getHealthIndicator(score: number): string {
  if (score >= 8) return '🟢';
  if (score >= 6) return '🟡';
  if (score >= 4) return '🟠';
  return '🔴';
}

/**
 * Extract key insights as bullet points
 */
function extractKeyInsights(analysis: Analysis): string[] {
  const insights: string[] = [];
  
  // Try to extract from various sections
  if (analysis.details?.sections) {
    const sections = analysis.details.sections;
    
    // Look for turning points, critical issues, etc.
    if (sections['Critical Issues']) {
      const critical = sections['Critical Issues'];
      const lines = critical.split('\n').filter((l: string) => l.trim().startsWith('-') || l.trim().startsWith('•'));
      insights.push(...lines.slice(0, 3).map((l: string) => l.replace(/^[-•]\s*/, '').trim()));
    }
  }
  
  return insights;
}

/**
 * Format next steps with checkboxes
 */
function formatNextSteps(nextSteps: string): string {
  // Convert numbered lists to checkbox format
  return nextSteps
    .split('\n')
    .map(line => {
      // Convert "1. Action" to "☐ Action"
      if (line.match(/^\d+\.\s/)) {
        return line.replace(/^\d+\.\s/, '☐ ');
      }
      return line;
    })
    .join('\n');
}

/**
 * Truncate text
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Get CRM URL
 */
function getCrmUrl(crmId: string): string | null {
  if (crmId.startsWith('006')) {
    return `https://anrok.lightning.force.com/${crmId}`;
  }
  return null;
}

