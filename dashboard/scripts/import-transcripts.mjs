import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { Pool } from '@neondatabase/serverless';
import { WebSocket } from 'ws';
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = WebSocket;

const DB_URL = 'postgresql://neondb_owner:npg_goT3tN1UZEYj@ep-floral-fog-ankqci7s-pooler.c-6.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';
const TRANSCRIPTS_DIR = process.argv[2];

if (!TRANSCRIPTS_DIR) {
  console.error('Usage: node scripts/import-transcripts.mjs <path-to-transcripts-dir>');
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

async function getExistingCallIds() {
  const res = await pool.query(`SELECT external_id FROM interactions WHERE type = 'call' AND external_id IS NOT NULL`);
  return new Set(res.rows.map(r => String(r.external_id)));
}

async function upsertDeal(meta) {
  const res = await pool.query(
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
  return res.rows[0].id;
}

async function insertInteraction(dealId, callId, meta, participants, turnCount) {
  const participantJson = participants.map(p => ({
    name: p.name ?? '',
    title: p.title ?? '',
    affiliation: p.affiliation ?? '',
    email: p.emailAddress ?? '',
  }));

  await pool.query(
    `INSERT INTO interactions
       (id, deal_id, external_id, type, title, timestamp, participants, blob_url, source, metadata, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'call', $3, $4, $5, $6, 'manual_import', $7, NOW())`,
    [
      dealId,
      String(callId),
      meta.title ?? meta.dealName ?? 'Call',
      meta.timestamp ? new Date(meta.timestamp).toISOString() : new Date().toISOString(),
      JSON.stringify(participantJson),
      `imported://transcripts/${callId}.json`,
      JSON.stringify({ turnCount, importedAt: new Date().toISOString() }),
    ]
  );
}

async function main() {
  const files = (await readdir(TRANSCRIPTS_DIR)).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} transcript files`);

  const existingIds = await getExistingCallIds();
  console.log(`${existingIds.size} call IDs already in database — will skip these\n`);

  let imported = 0, skipped = 0, errors = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const raw = await readFile(path.join(TRANSCRIPTS_DIR, file), 'utf-8');
      const transcript = JSON.parse(raw);
      const callId = String(transcript.callId ?? '');
      const meta = transcript._metadata ?? {};
      const participants = transcript._participants ?? [];

      if (!callId) { skipped++; continue; }
      if (!meta.crmId) { skipped++; continue; }

      if (existingIds.has(callId)) {
        skipped++;
        continue;
      }

      const dealId = await upsertDeal(meta);
      const turnCount = Array.isArray(transcript.turns) ? transcript.turns.length : 0;
      await insertInteraction(dealId, callId, meta, participants, turnCount);
      existingIds.add(callId); // prevent re-import within same run
      imported++;

      if (imported % 50 === 0) {
        process.stdout.write(`\r  Progress: ${i + 1}/${files.length} files — ${imported} imported, ${skipped} skipped, ${errors} errors`);
      }
    } catch (err) {
      errors++;
      console.error(`\nError processing ${file}: ${err.message}`);
    }
  }

  console.log(`\n\nDone.`);
  console.log(`  Imported : ${imported}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errors}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
