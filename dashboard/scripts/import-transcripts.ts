/**
 * Import a ZIP file or directory of Gong transcript JSON files into the database.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/import-transcripts.ts <path-to-zip-or-directory>
 *
 * Each JSON file must have the format exported by the deal-analyzer backend:
 *   { callId, turns, _metadata: { crmId, title, timestamp, dealName, accountName, stage }, _participants }
 */

import AdmZip from 'adm-zip';
import { sql } from '@vercel/postgres';
import { resolve, join } from 'path';
import { statSync, readdirSync, readFileSync } from 'fs';

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/import-transcripts.ts <path-to-zip>');
  process.exit(1);
}

interface TranscriptMetadata {
  title?: string;
  timestamp?: string;
  dealName?: string;
  accountName?: string;
  crmId?: string;
  stage?: string;
}

interface Participant {
  id?: string;
  name?: string;
  title?: string;
  speakerId?: string | null;
  affiliation?: string;
  emailAddress?: string;
}

interface Transcript {
  callId: string;
  turns: unknown[];
  metadata?: { segmentCount?: number; turnCount?: number };
  _metadata?: TranscriptMetadata;
  _participants?: Participant[];
}

async function upsertDeal(meta: TranscriptMetadata): Promise<string> {
  const result = await sql.query(
    `INSERT INTO deals (id, crm_id, name, account_name, stage, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
     ON CONFLICT (crm_id) DO UPDATE SET
       name         = COALESCE(EXCLUDED.name, deals.name),
       account_name = COALESCE(EXCLUDED.account_name, deals.account_name),
       stage        = COALESCE(EXCLUDED.stage, deals.stage),
       updated_at   = NOW()
     RETURNING id`,
    [meta.crmId ?? null, meta.dealName ?? null, meta.accountName ?? null, meta.stage ?? null]
  );
  return result.rows[0].id as string;
}

async function upsertInteraction(
  dealId: string,
  callId: string,
  meta: TranscriptMetadata,
  participants: Participant[],
  turnCount: number
) {
  const participantJson = participants.map(p => ({
    name: p.name ?? '',
    title: p.title ?? '',
    affiliation: p.affiliation ?? '',
    email: p.emailAddress ?? '',
  }));

  // Estimate duration from turns if available — timestamp of last turn in ms → seconds
  await sql.query(
    `INSERT INTO interactions
       (id, deal_id, external_id, type, title, timestamp, participants, blob_url, source, metadata, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'call', $3, $4, $5, $6, 'manual_import', $7, NOW())
     ON CONFLICT (external_id) DO UPDATE SET
       deal_id      = EXCLUDED.deal_id,
       title        = COALESCE(EXCLUDED.title, interactions.title),
       timestamp    = COALESCE(EXCLUDED.timestamp, interactions.timestamp),
       participants = EXCLUDED.participants,
       metadata     = EXCLUDED.metadata`,
    [
      dealId,
      callId,
      meta.title ?? meta.dealName ?? 'Call',
      meta.timestamp ? new Date(meta.timestamp).toISOString() : new Date().toISOString(),
      JSON.stringify(participantJson),
      `imported://transcripts/${callId}.json`,
      JSON.stringify({ turnCount, importedAt: new Date().toISOString() }),
    ]
  );
}

interface FileEntry { name: string; read: () => string }

function getEntries(inputPath: string): FileEntry[] {
  const abs = resolve(inputPath);
  const stat = statSync(abs);

  if (stat.isDirectory()) {
    return readdirSync(abs)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f, read: () => readFileSync(join(abs, f), 'utf-8') }));
  }

  // ZIP file
  const zip = new AdmZip(abs);
  return zip.getEntries()
    .filter(e => e.entryName.endsWith('.json') && !e.isDirectory)
    .map(e => ({ name: e.entryName, read: () => e.getData().toString('utf-8') }));
}

async function main() {
  const absPath = resolve(zipPath);
  console.log(`\nImporting transcripts from: ${absPath}\n`);

  const entries = getEntries(zipPath);
  console.log(`Found ${entries.length} JSON files\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of entries) {
    const filename = entry.name;
    try {
      const raw = entry.read();
      const transcript: Transcript = JSON.parse(raw);

      const meta = transcript._metadata ?? {};
      const participants = transcript._participants ?? [];
      const callId = transcript.callId;

      if (!callId) {
        console.warn(`  ⚠️  ${filename} — missing callId, skipping`);
        skipped++;
        continue;
      }

      if (!meta.crmId) {
        console.warn(`  ⚠️  ${filename} — missing _metadata.crmId, skipping`);
        skipped++;
        continue;
      }

      process.stdout.write(`  ${meta.dealName ?? meta.crmId} / ${meta.title ?? callId}... `);

      // 1. Upsert deal
      const dealId = await upsertDeal(meta);

      // 2. Create interaction record (no blob upload — metadata only)
      const turnCount = Array.isArray(transcript.turns) ? transcript.turns.length : 0;
      await upsertInteraction(dealId, callId, meta, participants, turnCount);

      console.log('✅');
      imported++;
    } catch (err) {
      console.error(`\n  ❌ ${filename}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  console.log(`\n─────────────────────────────`);
  console.log(`✅ Imported: ${imported}`);
  if (skipped) console.log(`⚠️  Skipped:  ${skipped}`);
  if (errors)  console.log(`❌ Errors:   ${errors}`);
  console.log(`─────────────────────────────\n`);

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
