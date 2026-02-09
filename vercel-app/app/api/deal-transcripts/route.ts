import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { sql } from '@vercel/postgres';
import { WebClient } from '@slack/web-api';
import { requireApiKey, isAuthError } from '@/lib/auth/api-key';
import { retrieveContent } from '@/lib/blob/storage';
import JSZip from 'jszip';

/**
 * Deal Transcripts Endpoint
 *
 * Downloads all transcripts for a specific deal by CRM ID
 *
 * Slack command: /deal-transcripts <crm_id>
 * API: POST with crm_id and channel_id
 */

export const maxDuration = 300; // Pro tier: 5 minutes

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let channelId: string;
    let crmId: string | undefined;
    let responseUrl: string | undefined;
    let isSlashCommand = false;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Slack slash command format
      const formData = await request.formData();
      channelId = formData.get('channel_id') as string;
      responseUrl = formData.get('response_url') as string;
      const text = (formData.get('text') as string || '').trim();
      isSlashCommand = true;

      // Parse CRM ID from command text
      crmId = text || undefined;

      console.log(`[Deal Transcripts] Slash command for CRM ID: ${crmId}`);
    } else {
      // JSON webhook format
      const body = await request.json();
      channelId = body.channel_id || body.channel;
      crmId = body.crm_id;
      responseUrl = body.response_url;

      // Verify API key (supports both legacy and new keys)
      const authResult = await requireApiKey(request);
      if (isAuthError(authResult)) {
        return authResult;
      }

      console.log(`[Deal Transcripts] API request for CRM ID: ${crmId}`);
    }

    if (!crmId) {
      const message = 'Please provide a CRM ID. Usage: `/deal-transcripts 006PP00000X9VKwYAN`';
      if (isSlashCommand) {
        return NextResponse.json({ response_type: 'ephemeral', text: message });
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (!channelId) {
      return NextResponse.json({ error: 'Missing channel_id' }, { status: 400 });
    }

    // For slash commands, respond immediately and run in background
    if (isSlashCommand) {
      after(async () => {
        try {
          console.log(`[Deal Transcripts] Background processing started for ${crmId}`);
          await processAndUpload(channelId, crmId!, responseUrl);
          console.log(`[Deal Transcripts] Background processing completed`);
        } catch (err) {
          console.error('[Deal Transcripts] Background processing failed:', err);
          if (responseUrl) {
            await fetch(responseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                response_type: 'ephemeral',
                text: `❌ Failed: ${(err as Error).message}`,
              }),
            }).catch(() => {});
          }
        }
      });

      return NextResponse.json({
        response_type: 'ephemeral',
        text: `⏳ Fetching transcripts for deal ${crmId}...`,
      });
    }

    const result = await processAndUpload(channelId, crmId, responseUrl);
    return NextResponse.json(result);

  } catch (error) {
    console.error('[Deal Transcripts] Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

/**
 * Process transcripts for a deal and upload to Slack
 */
async function processAndUpload(
  channelId: string,
  crmId: string,
  responseUrl?: string
): Promise<{ success: boolean; message: string; fileId?: string }> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) {
    throw new Error('SLACK_BOT_TOKEN not configured');
  }

  const slack = new WebClient(slackToken);

  // First, find the deal (trim any whitespace from input)
  const cleanCrmId = crmId.trim();
  console.log(`[Deal Transcripts] Looking up CRM ID: "${cleanCrmId}" (length: ${cleanCrmId.length})`);

  const dealQuery = await sql`
    SELECT id, name, stage, account_name, crm_id
    FROM deals
    WHERE crm_id = ${cleanCrmId}
  `;

  if (dealQuery.rows.length === 0) {
    const message = `No deal found with CRM ID: ${crmId}`;
    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_type: 'ephemeral', text: message }),
      });
    }
    return { success: false, message };
  }

  const deal = dealQuery.rows[0];
  console.log(`[Deal Transcripts] Found deal: ${deal.name} (${deal.stage})`);

  // Query all transcripts for this deal
  const query = await sql`
    SELECT i.id, i.external_id, i.title, i.timestamp, i.blob_url, i.metadata, i.participants,
           d.name as deal_name, d.crm_id, d.account_name, d.stage
    FROM interactions i
    JOIN deals d ON i.deal_id = d.id
    WHERE d.crm_id = ${cleanCrmId}
      AND i.type = 'call'
      AND i.blob_url IS NOT NULL
    ORDER BY i.timestamp ASC
  `;

  const transcripts = query.rows;
  console.log(`[Deal Transcripts] Found ${transcripts.length} transcripts for ${deal.name}`);

  if (transcripts.length === 0) {
    const message = `No transcripts found for deal: ${deal.name}`;
    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_type: 'ephemeral', text: message }),
      });
    }
    return { success: true, message };
  }

  // Create ZIP file
  const zip = new JSZip();

  // Add manifest
  const manifest = {
    exportDate: new Date().toISOString(),
    deal: {
      crmId: deal.crm_id,
      name: deal.name,
      stage: deal.stage,
      accountName: deal.account_name,
    },
    totalTranscripts: transcripts.length,
    dateRange: {
      earliest: transcripts[0]?.timestamp,
      latest: transcripts[transcripts.length - 1]?.timestamp,
    },
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Process transcripts
  let processed = 0;
  let failed = 0;

  for (const transcript of transcripts) {
    try {
      const content = await retrieveContent(transcript.blob_url);

      // Build speaker map from participants
      const speakerMap = buildSpeakerMap(transcript.participants);

      // Parse and enrich transcript
      const parsed = JSON.parse(content);

      // Map speaker IDs to names in turns
      const enrichedTurns = parsed.turns?.map((turn: any) => {
        const speakerId = String(turn.speakerId || turn.speaker || 'unknown');
        const speakerInfo = speakerMap.get(speakerId);
        return {
          ...turn,
          speakerName: speakerInfo?.name || null,
          speakerEmail: speakerInfo?.email || null,
          speakerType: speakerInfo?.isAnrok ? 'anrok' : 'customer',
          speakerTitle: speakerInfo?.title || null,
        };
      });

      const enriched = {
        ...parsed,
        turns: enrichedTurns || parsed.turns,
        _metadata: {
          title: transcript.title,
          timestamp: transcript.timestamp,
          dealName: transcript.deal_name,
          accountName: transcript.account_name,
          crmId: transcript.crm_id,
          stage: transcript.stage,
        },
        _participants: transcript.participants,
      };

      // Create filename with sequence number for ordering
      const seq = String(processed + 1).padStart(3, '0');
      const date = new Date(transcript.timestamp).toISOString().split('T')[0];
      const titleSlug = (transcript.title || 'call')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 40);
      const filename = `${seq}_${date}_${titleSlug}.json`;

      zip.file(`transcripts/${filename}`, JSON.stringify(enriched, null, 2));
      processed++;
    } catch (err) {
      console.error(`[Deal Transcripts] Failed to process ${transcript.external_id}:`, err);
      failed++;
    }
  }

  console.log(`[Deal Transcripts] Processed ${processed}, failed ${failed}`);

  // Generate ZIP buffer
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Upload to Slack
  const dealSlug = deal.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const filename = `${dealSlug}_transcripts.zip`;

  console.log(`[Deal Transcripts] Uploading ${zipBuffer.length} bytes to Slack`);

  try {
    const uploadResult = await slack.filesUploadV2({
      channel_id: channelId,
      file: zipBuffer,
      filename: filename,
      title: `Transcripts: ${deal.name}`,
      initial_comment: `📁 *Deal Transcripts*\n• Deal: ${deal.name}\n• Stage: ${deal.stage}\n• Transcripts: ${processed}\n• Date range: ${new Date(transcripts[0].timestamp).toLocaleDateString()} - ${new Date(transcripts[transcripts.length - 1].timestamp).toLocaleDateString()}`,
    });

    console.log('[Deal Transcripts] Upload successful');

    return {
      success: true,
      message: `Uploaded ${processed} transcripts for ${deal.name}`,
      fileId: (uploadResult as any).file?.id,
    };
  } catch (uploadError: any) {
    console.error('[Deal Transcripts] Upload failed:', uploadError);

    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: `❌ Failed to upload: ${uploadError.message}`,
        }),
      });
    }

    throw uploadError;
  }
}

/**
 * Build speaker map from participants data
 */
function buildSpeakerMap(participants: any[]): Map<string, {
  name: string;
  email: string | null;
  title: string | null;
  isAnrok: boolean;
}> {
  const speakerMap = new Map();
  if (!participants || !Array.isArray(participants)) return speakerMap;

  for (const p of participants) {
    const speakerId = p.speakerId || p.id;
    if (!speakerId) continue;

    const name = p.name || p.emailAddress?.split('@')[0] || 'Unknown';
    const email = p.emailAddress || null;
    const title = p.title || null;
    const isAnrok = (email?.toLowerCase().includes('@anrok.com') ||
                     email?.toLowerCase().includes('@anrok.io') ||
                     p.affiliation === 'Internal');

    speakerMap.set(String(speakerId), { name, email, title, isAnrok });
  }
  return speakerMap;
}
