import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { 
  getDealById, 
  getInteractionsForDeal, 
  getManualEmailsForDeal, 
  getLatestAnalysis,
  getExcludedInteractionsForDeal,
  excludeInteraction,
  includeInteraction,
} from '@/lib/db/client';

/**
 * Slack Interactions Handler
 * POST /api/slack-interactions
 * 
 * Handles interactive button clicks from Slack
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    
    // Parse URL-encoded payload
    const params = new URLSearchParams(body);
    const payloadStr = params.get('payload');
    
    if (!payloadStr) {
      return NextResponse.json({ error: 'No payload' }, { status: 400 });
    }
    
    const payload = JSON.parse(payloadStr);
    
    console.log('[Slack Interaction] Received:', payload.type, payload.actions?.[0]?.action_id);
    
    // Handle button clicks
    if (payload.type === 'block_actions' && payload.actions?.[0]) {
      const action = payload.actions[0];
      const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN!);
      
      if (action.action_id === 'show_interactions') {
        // Get deal ID from button value
        const dealId = action.value;
        
        // Fetch interactions
        const interactions = await getInteractionsForDeal(dealId);
        const manualEmails = await getManualEmailsForDeal(dealId);
        
        // Post interactions to the thread
        await postInteractionsToThread(
          slackClient,
          payload.channel.id,
          payload.message.ts,
          interactions,
          manualEmails
        );
        
        // Acknowledge the interaction
        return NextResponse.json({ ok: true });
      }
      
      if (action.action_id === 'download_full_analysis') {
        // Post full analysis as a snippet (code block) to thread
        const dealId = action.value;
        const deal = await getDealById(dealId);
        
        if (deal) {
          const analysis = await getLatestAnalysis(deal.id);
          
          if (analysis && analysis.details?.fullText) {
            // Upload as snippet for code block rendering
            await slackClient.files.uploadV2({
              channel_id: payload.channel.id,
              thread_ts: payload.message.ts,
              content: analysis.details.fullText,
              filename: `${deal.name.replace(/[^a-z0-9]/gi, '-')}-analysis.md`,
              snippet_type: 'markdown',
              title: `📊 Complete Analysis Report for ${deal.name}`,
            });
          }
        }
        
        // Acknowledge the interaction
        return NextResponse.json({ ok: true });
      }
      
      if (action.action_id === 'exclude_interaction') {
        // Exclude interaction from future analyses
        const interactionId = action.value;
        console.log('[Slack Interaction] Excluding interaction:', interactionId);
        
        await excludeInteraction(interactionId);
        console.log('[Slack Interaction] Interaction excluded in DB');
        
        // Update the message to show it's excluded
        await slackClient.chat.update({
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: payload.message.text,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `~${payload.message.text}~\n_Excluded from future analyses_`,
              },
            },
          ],
        });
        
        console.log('[Slack Interaction] Message updated');
        return NextResponse.json({ ok: true });
      }
      
      if (action.action_id === 'include_interaction') {
        // Re-include a previously excluded interaction
        const interactionId = action.value;
        
        await includeInteraction(interactionId);
        
        // Fetch the interaction to get its details
        const { sql } = await import('@vercel/postgres');
        const result = await sql`SELECT * FROM interactions WHERE id = ${interactionId}`;
        const interaction = result.rows[0];
        
        if (interaction) {
          const type = interaction.type === 'call' ? '📞 Call' : '📧 Email';
          const date = new Date(interaction.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const time = new Date(interaction.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          let text = `${type}: *${interaction.title}*\n   ${date} at ${time}`;
          
          // Update message to show it's included again
          await slackClient.chat.update({
            channel: payload.channel.id,
            ts: payload.message.ts,
            text,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `${text}\n_Re-included in analyses_`,
                },
              },
            ],
          });
        }
        
        return NextResponse.json({ ok: true });
      }
      
      if (action.action_id === 'show_excluded') {
        // Show excluded interactions
        const dealId = action.value;
        const excluded = await getExcludedInteractionsForDeal(dealId);
        
        await postExcludedInteractions(
          slackClient,
          payload.channel.id,
          payload.message.ts,
          excluded
        );
        
        return NextResponse.json({ ok: true });
      }
      
      if (action.action_id === 'rerun_analysis') {
        // Trigger new analysis for this deal
        const dealId = action.value;
        console.log('[Slack Interaction] Re-running analysis for deal:', dealId);
        
        const deal = await getDealById(dealId);
        
        if (deal) {
          console.log('[Slack Interaction] Found deal:', deal.name);
          
          // Call the analyze-deal endpoint
          const baseUrl = 'https://anrok-deal-analyzer.vercel.app';
          
          const response = await fetch(`${baseUrl}/api/analyze-deal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dealId: deal.id }),
          });
          
          const result = await response.json();
          console.log('[Slack Interaction] Analysis triggered:', result);
          
          // Post confirmation in thread
          await slackClient.chat.postMessage({
            channel: payload.channel.id,
            thread_ts: payload.message.ts,
            text: `🔄 Re-analysis triggered! Check the channel for the new analysis thread.`,
          });
        }
        
        return NextResponse.json({ ok: true });
      }
    }
    
    return NextResponse.json({ ok: true });
    
  } catch (error) {
    console.error('[Slack Interaction] Error:', error);
    return NextResponse.json({ ok: true }); // Always return 200 to Slack
  }
}

/**
 * Post interactions timeline to thread
 */
async function postInteractionsToThread(
  client: WebClient,
  channel: string,
  threadTs: string,
  interactions: any[],
  manualEmails: any[]
) {
  // Combine all interactions with their IDs
  const allItems = [
    ...interactions.map(i => ({
      id: i.id,
      type: i.type === 'call' ? '📞 Call' : '📧 Email',
      title: i.title || 'Untitled',
      timestamp: new Date(i.timestamp),
      duration: i.duration,
    })),
    ...manualEmails.map(e => ({
      id: e.id,
      type: '📧 Email',
      title: e.subject,
      timestamp: new Date(e.timestamp),
      duration: null,
    })),
  ];
  
  allItems.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  if (allItems.length === 0) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: 'No interactions found for this deal.',
    });
    return;
  }
  
  // Post header
  const calls = allItems.filter(i => i.type === '📞 Call').length;
  const emails = allItems.filter(i => i.type === '📧 Email').length;
  
  await client.chat.postMessage({
    channel,
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
  
  // Post each interaction as a separate message with exclude button
  for (let idx = 0; idx < allItems.length; idx++) {
    const item = allItems[idx];
    const date = item.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const time = item.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    let text = `${idx + 1}. ${item.type}: *${item.title}*\n   ${date} at ${time}`;
    
    if (item.duration) {
      const minutes = Math.floor(item.duration / 60);
      text += ` • ${minutes} min`;
    }
    
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text,
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '🗑️ Exclude',
            },
            action_id: 'exclude_interaction',
            value: item.id,
            style: 'danger',
            confirm: {
              title: {
                type: 'plain_text',
                text: 'Exclude from Analysis?',
              },
              text: {
                type: 'mrkdwn',
                text: 'This interaction will be excluded from future analyses. You can re-include it later.',
              },
              confirm: {
                type: 'plain_text',
                text: 'Exclude',
              },
              deny: {
                type: 'plain_text',
                text: 'Cancel',
              },
            },
          },
        },
      ],
    });
  }
}

/**
 * Post excluded interactions to thread
 */
async function postExcludedInteractions(
  client: WebClient,
  channel: string,
  threadTs: string,
  excludedInteractions: any[]
) {
  if (excludedInteractions.length === 0) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: 'No excluded interactions.',
    });
    return;
  }
  
  // Post header
  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: 'Excluded Interactions',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🗑️ Excluded Interactions',
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `These ${excludedInteractions.length} interaction${excludedInteractions.length !== 1 ? 's are' : ' is'} excluded from analysis. Click to re-include.`,
          },
        ],
      },
    ],
  });
  
  // Post each excluded interaction with include button
  for (const interaction of excludedInteractions) {
    const type = interaction.type === 'call' ? '📞 Call' : '📧 Email';
    const date = new Date(interaction.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const time = new Date(interaction.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const text = `~${type}: ${interaction.title}~\n   ${date} at ${time}`;
    
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text,
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Include',
            },
            action_id: 'include_interaction',
            value: interaction.id,
            style: 'primary',
          },
        },
      ],
    });
  }
}

