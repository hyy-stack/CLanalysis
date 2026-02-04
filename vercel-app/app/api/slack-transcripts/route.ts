import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { WebClient } from '@slack/web-api';
import { retrieveContent } from '@/lib/blob/storage';
import JSZip from 'jszip';

/**
 * Slack Transcripts Endpoint
 *
 * Handles both:
 * 1. Slack slash command: /transcripts [days]
 * 2. Slack Workflow webhook: POST with channel_id and optional days
 *
 * Default: 14 days of transcripts
 */

const DEFAULT_DAYS = 14;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let channelId: string;
    let days: number = DEFAULT_DAYS;
    let responseUrl: string | undefined;
    let isSlashCommand = false;

    // Parse request based on content type
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Slack slash command format
      const formData = await request.formData();
      channelId = formData.get('channel_id') as string;
      responseUrl = formData.get('response_url') as string;
      const text = (formData.get('text') as string || '').trim();
      isSlashCommand = true;

      // Parse days from command text (e.g., "/transcripts 7")
      if (text) {
        const parsedDays = parseInt(text);
        if (!isNaN(parsedDays) && parsedDays > 0 && parsedDays <= 365) {
          days = parsedDays;
        }
      }

      // Verify Slack request (optional but recommended)
      // const slackSignature = request.headers.get('x-slack-signature');
      // const slackTimestamp = request.headers.get('x-slack-request-timestamp');
      // TODO: Add signature verification for production

      console.log(`[Slack Transcripts] Slash command from channel ${channelId}, days=${days}`);
    } else {
      // JSON webhook format (from Slack Workflow or API)
      const body = await request.json();
      channelId = body.channel_id || body.channel;
      days = body.days || DEFAULT_DAYS;
      responseUrl = body.response_url; // Pass through for background processing

      // For workflow webhooks, verify API key
      const apiKey = request.headers.get('x-api-key');
      if (apiKey !== process.env.INTERNAL_API_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      console.log(`[Slack Transcripts] Webhook request for channel ${channelId}, days=${days}`);
    }

    if (!channelId) {
      return NextResponse.json({ error: 'Missing channel_id' }, { status: 400 });
    }

    // For slash commands, respond immediately and trigger background processing
    if (isSlashCommand) {
      // Trigger processing via internal API call (runs in separate invocation)
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      fetch(`${baseUrl}/api/slack-transcripts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.INTERNAL_API_KEY || '',
        },
        body: JSON.stringify({
          channel_id: channelId,
          days,
          response_url: responseUrl,
        }),
      }).catch(err => {
        console.error('[Slack Transcripts] Failed to trigger background processing:', err);
      });

      return NextResponse.json({
        response_type: 'ephemeral',
        text: `⏳ Generating transcript archive for the last ${days} days... This may take a minute.`,
      });
    }

    // For webhook requests, process synchronously
    const result = await processAndUpload(channelId, days, responseUrl);
    return NextResponse.json(result);

  } catch (error) {
    console.error('[Slack Transcripts] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

/**
 * Process transcripts and upload to Slack
 */
async function processAndUpload(
  channelId: string,
  days: number,
  responseUrl?: string
): Promise<{ success: boolean; message: string; fileId?: string }> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) {
    throw new Error('SLACK_BOT_TOKEN not configured');
  }

  const slack = new WebClient(slackToken);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffIso = cutoffDate.toISOString();

  console.log(`[Slack Transcripts] Fetching transcripts since ${cutoffIso}`);

  // Query transcripts from the last N days
  const query = await sql`
    SELECT i.id, i.external_id, i.title, i.timestamp, i.blob_url, i.metadata,
           d.name as deal_name, d.crm_id, d.account_name
    FROM interactions i
    LEFT JOIN deals d ON i.deal_id = d.id
    WHERE i.type = 'call'
      AND i.blob_url IS NOT NULL
      AND i.timestamp >= ${cutoffIso}::timestamp
    ORDER BY i.timestamp DESC
  `;

  const transcripts = query.rows;
  console.log(`[Slack Transcripts] Found ${transcripts.length} transcripts in last ${days} days`);

  if (transcripts.length === 0) {
    const message = `No transcripts found in the last ${days} days.`;

    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: message,
        }),
      });
    }

    return { success: true, message };
  }

  // Create ZIP file
  const zip = new JSZip();

  // Add manifest
  const manifest = {
    exportDate: new Date().toISOString(),
    daysIncluded: days,
    cutoffDate: cutoffIso,
    totalTranscripts: transcripts.length,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Process transcripts
  let processed = 0;
  let failed = 0;

  for (const transcript of transcripts) {
    try {
      const content = await retrieveContent(transcript.blob_url);

      // Create filename
      const date = new Date(transcript.timestamp).toISOString().split('T')[0];
      const dealName = (transcript.deal_name || transcript.account_name || 'no-deal')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 50);
      const callId = transcript.external_id;
      const filename = `${date}_${dealName}_${callId}.json`;

      // Enrich with metadata
      const enriched = {
        ...JSON.parse(content),
        _metadata: {
          title: transcript.title,
          timestamp: transcript.timestamp,
          dealName: transcript.deal_name,
          accountName: transcript.account_name,
          crmId: transcript.crm_id,
        },
      };

      zip.file(`transcripts/${filename}`, JSON.stringify(enriched, null, 2));
      processed++;
    } catch (err) {
      console.error(`[Slack Transcripts] Failed to process ${transcript.external_id}:`, err);
      failed++;
    }
  }

  console.log(`[Slack Transcripts] Processed ${processed}, failed ${failed}`);

  // Generate ZIP buffer
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Upload to Slack
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `transcripts_${days}d_${dateStr}.zip`;

  console.log(`[Slack Transcripts] Uploading ${zipBuffer.length} bytes to Slack channel ${channelId}`);

  try {
    const uploadResult = await slack.filesUploadV2({
      channel_id: channelId,
      file: zipBuffer,
      filename: filename,
      title: `Call Transcripts - Last ${days} Days`,
      initial_comment: `📁 *Call Transcripts Archive*\n• Period: Last ${days} days\n• Transcripts: ${processed}\n• Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`,
    });

    console.log('[Slack Transcripts] Upload successful');

    // Respond to slash command if needed
    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'in_channel',
          text: `✅ Uploaded ${processed} transcripts from the last ${days} days.`,
        }),
      });
    }

    return {
      success: true,
      message: `Uploaded ${processed} transcripts`,
      fileId: (uploadResult as any).file?.id,
    };
  } catch (uploadError: any) {
    console.error('[Slack Transcripts] Upload failed:', uploadError);

    // Try to notify about failure
    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: `❌ Failed to upload transcripts: ${uploadError.message}`,
        }),
      });
    }

    throw uploadError;
  }
}
