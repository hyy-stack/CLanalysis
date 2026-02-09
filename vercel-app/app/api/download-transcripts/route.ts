import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireApiKey, isAuthError } from '@/lib/auth/api-key';
import { retrieveContent } from '@/lib/blob/storage';
import JSZip from 'jszip';

/**
 * Download all transcripts as a ZIP file
 * GET /api/download-transcripts
 *
 * Query params:
 * - includeExcluded: "true" to include excluded calls (default: true)
 * - dealId: filter by specific deal ID
 * - format: "json" (default) or "txt" for plain text
 */
export async function GET(request: NextRequest) {
  // Verify API key
  const authResult = await requireApiKey(request);
  if (isAuthError(authResult)) {
    return authResult;
  }

  const searchParams = request.nextUrl.searchParams;
  const includeExcluded = searchParams.get('includeExcluded') !== 'false';
  const dealId = searchParams.get('dealId');
  const format = searchParams.get('format') || 'json';

  try {
    console.log('[Download Transcripts] Starting export...');

    // Query interactions with transcripts
    let query;
    if (dealId) {
      query = await sql`
        SELECT i.id, i.external_id, i.title, i.timestamp, i.blob_url, i.metadata,
               d.name as deal_name, d.crm_id, d.account_name
        FROM interactions i
        LEFT JOIN deals d ON i.deal_id = d.id
        WHERE i.type = 'call'
          AND i.blob_url IS NOT NULL
          AND i.deal_id = ${dealId}
        ORDER BY i.timestamp DESC
      `;
    } else {
      query = await sql`
        SELECT i.id, i.external_id, i.title, i.timestamp, i.blob_url, i.metadata,
               d.name as deal_name, d.crm_id, d.account_name
        FROM interactions i
        LEFT JOIN deals d ON i.deal_id = d.id
        WHERE i.type = 'call'
          AND i.blob_url IS NOT NULL
        ORDER BY i.timestamp DESC
      `;
    }

    const interactions = query.rows;
    console.log(`[Download Transcripts] Found ${interactions.length} transcripts`);

    // Filter out excluded if needed
    const filtered = includeExcluded
      ? interactions
      : interactions.filter(i => !i.metadata?.exclusionReason);

    console.log(`[Download Transcripts] Processing ${filtered.length} transcripts (includeExcluded=${includeExcluded})`);

    // Create ZIP file
    const zip = new JSZip();

    // Add manifest file
    const manifest = {
      exportDate: new Date().toISOString(),
      totalTranscripts: filtered.length,
      includeExcluded,
      format,
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    // Process each transcript
    let processed = 0;
    let failed = 0;

    for (const interaction of filtered) {
      try {
        const content = await retrieveContent(interaction.blob_url);

        // Create filename with metadata
        const date = new Date(interaction.timestamp).toISOString().split('T')[0];
        const dealName = (interaction.deal_name || interaction.account_name || 'no-deal')
          .replace(/[^a-zA-Z0-9]/g, '_')
          .substring(0, 50);
        const callId = interaction.external_id;
        const filename = `${date}_${dealName}_${callId}`;

        if (format === 'txt') {
          // Convert JSON transcript to plain text
          const transcript = JSON.parse(content);
          let textContent = `# ${interaction.title || 'Call Transcript'}\n`;
          textContent += `Date: ${interaction.timestamp}\n`;
          textContent += `Deal: ${interaction.deal_name || 'N/A'}\n`;
          textContent += `Account: ${interaction.account_name || 'N/A'}\n`;
          textContent += `CRM ID: ${interaction.crm_id || 'N/A'}\n`;
          if (interaction.metadata?.exclusionReason) {
            textContent += `Excluded: ${interaction.metadata.exclusionReason}\n`;
          }
          textContent += '\n---\n\n';

          if (transcript.turns && Array.isArray(transcript.turns)) {
            for (const turn of transcript.turns) {
              const minutes = Math.floor((turn.timestamp || 0) / 60);
              const seconds = (turn.timestamp || 0) % 60;
              const time = `${minutes}:${seconds.toString().padStart(2, '0')}`;
              textContent += `[${time}] ${turn.speaker || 'Unknown'}: ${turn.text}\n`;
            }
          }

          zip.file(`transcripts/${filename}.txt`, textContent);
        } else {
          // Add metadata to JSON
          const enriched = {
            ...JSON.parse(content),
            _metadata: {
              title: interaction.title,
              timestamp: interaction.timestamp,
              dealName: interaction.deal_name,
              accountName: interaction.account_name,
              crmId: interaction.crm_id,
              exclusionReason: interaction.metadata?.exclusionReason,
            },
          };
          zip.file(`transcripts/${filename}.json`, JSON.stringify(enriched, null, 2));
        }

        processed++;
        if (processed % 50 === 0) {
          console.log(`[Download Transcripts] Processed ${processed}/${filtered.length}`);
        }
      } catch (error) {
        console.error(`[Download Transcripts] Failed to process ${interaction.external_id}:`, error);
        failed++;
      }
    }

    console.log(`[Download Transcripts] Complete: ${processed} processed, ${failed} failed`);

    // Generate ZIP as ArrayBuffer
    const zipArrayBuffer = await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Return ZIP file
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `transcripts_${dateStr}.zip`;

    return new Response(zipArrayBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipArrayBuffer.byteLength.toString(),
      },
    });

  } catch (error) {
    console.error('[Download Transcripts] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate transcript archive' },
      { status: 500 }
    );
  }
}

/**
 * Get transcript statistics
 * POST /api/download-transcripts
 */
export async function POST(request: NextRequest) {
  // Verify API key
  const authResult = await requireApiKey(request);
  if (isAuthError(authResult)) {
    return authResult;
  }

  try {
    // Get counts
    const totalResult = await sql`
      SELECT COUNT(*) as count FROM interactions WHERE type = 'call' AND blob_url IS NOT NULL
    `;
    const excludedResult = await sql`
      SELECT COUNT(*) as count FROM interactions
      WHERE type = 'call' AND blob_url IS NOT NULL
      AND metadata->>'exclusionReason' IS NOT NULL
    `;
    const byDealResult = await sql`
      SELECT d.name, d.crm_id, COUNT(i.id) as transcript_count
      FROM interactions i
      JOIN deals d ON i.deal_id = d.id
      WHERE i.type = 'call' AND i.blob_url IS NOT NULL
      GROUP BY d.id, d.name, d.crm_id
      ORDER BY transcript_count DESC
      LIMIT 20
    `;
    const orphanedResult = await sql`
      SELECT COUNT(*) as count FROM interactions
      WHERE type = 'call' AND blob_url IS NOT NULL AND deal_id IS NULL
    `;

    return NextResponse.json({
      total: parseInt(totalResult.rows[0].count),
      excluded: parseInt(excludedResult.rows[0].count),
      orphaned: parseInt(orphanedResult.rows[0].count),
      topDeals: byDealResult.rows,
    });
  } catch (error) {
    console.error('[Download Transcripts] Stats error:', error);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
