import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { getDealById, getInteractionsForDeal, getManualEmailsForDeal, getLatestAnalysis } from '@/lib/db/client';

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
  
  if (allItems.length === 0) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: 'No interactions found for this deal.',
    });
    return;
  }
  
  // Build timeline
  const timeline = allItems.map((item, idx) => {
    const date = item.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const time = item.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    let line = `${idx + 1}. ${item.type}: *${item.title}*\n   ${date} at ${time}`;
    
    if (item.duration) {
      const minutes = Math.floor(item.duration / 60);
      line += ` • ${minutes} min`;
    }
    
    return line;
  }).join('\n\n');
  
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
}

