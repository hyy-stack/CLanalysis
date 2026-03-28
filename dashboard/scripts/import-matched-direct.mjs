/**
 * Import matched no-deal transcripts directly into the DB.
 * Reads a matches CSV (from match-nodeal-transcripts.py), injects crmId,
 * and upserts deals + interactions — skipping call IDs already in the DB.
 *
 * Usage:
 *   node scripts/import-matched-direct.mjs \
 *     --matches ~/Downloads/nodeal_matches_90d.csv \
 *     --transcripts ~/Downloads/transcripts_90d_2026-03-28/transcripts
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { WebSocket } from 'ws';
import readline from 'readline';
import os from 'os';

neonConfig.webSocketConstructor = WebSocket;

const DB_URL = 'postgresql://neondb_owner:npg_goT3tN1UZEYj@ep-floral-fog-ankqci7s-pooler.c-6.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

// Parse args
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, arr) => {
    if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const matchesPath = args.matches?.replace('~', os.homedir());
const transcriptsDir = args.transcripts?.replace('~', os.homedir());

if (!matchesPath || !transcriptsDir) {
  console.error('Usage: node scripts/import-matched-direct.mjs --matches <csv> --transcripts <dir>');
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

async function readCsv(filePath) {
  const rows = [];
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    const cols = line.split(',');
    if (!headers) { headers = cols; continue; }
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (cols[i] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

async function getExistingCallIds() {
  const res = await pool.query(`SELECT external_id FROM interactions WHERE type = 'call' AND external_id IS NOT NULL`);
  return new Set(res.rows.map(r => String(r.external_id)));
}

async function upsertDeal(crmId, dealName, accountName, stage) {
  const res = await pool.query(
    `INSERT INTO deals (id, crm_id, name, account_name, stage, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
     ON CONFLICT (crm_id) DO UPDATE SET
       name         = COALESCE(EXCLUDED.name, deals.name),
       account_name = COALESCE(EXCLUDED.account_name, deals.account_name),
       stage        = COALESCE(EXCLUDED.stage, deals.stage),
       updated_at   = NOW()
     RETURNING id`,
    [crmId, dealName, accountName, stage]
  );
  return res.rows[0].id;
}

async function insertInteraction(dealId, callId, title, timestamp, participants, turnCount) {
  await pool.query(
    `INSERT INTO interactions
       (id, deal_id, external_id, type, title, timestamp, participants, blob_url, source, metadata, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'call', $3, $4, $5, $6, 'manual_import', $7, NOW())`,
    [
      dealId,
      String(callId),
      title || 'Call',
      timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      JSON.stringify(participants),
      `imported://transcripts/${callId}.json`,
      JSON.stringify({ turnCount, importedAt: new Date().toISOString(), matchedByCrmScript: true }),
    ]
  );
}

async function main() {
  const matches = (await readCsv(matchesPath)).filter(r => r.match_status === 'MATCH');
  console.log(`Found ${matches.length} matched transcripts`);

  const existingIds = await getExistingCallIds();
  console.log(`${existingIds.size} call IDs already in DB — will skip\n`);

  let imported = 0, skipped = 0, errors = 0;

  for (const m of matches) {
    const callId = m.call_id;
    if (!callId || existingIds.has(callId)) { skipped++; continue; }

    try {
      const fname = m.transcript_file;
      const raw = await readFile(path.join(transcriptsDir, fname), 'utf-8');
      const transcript = JSON.parse(raw);
      const participants = (transcript._participants ?? []).map(p => ({
        name: p.name ?? '',
        title: p.title ?? '',
        affiliation: p.affiliation ?? '',
        email: p.emailAddress ?? '',
      }));
      const turnCount = Array.isArray(transcript.turns) ? transcript.turns.length : 0;

      const dealId = await upsertDeal(m.crm_id, m.crm_account, m.crm_account, m.crm_stage);
      await insertInteraction(dealId, callId, m.call_title, m.call_timestamp, participants, turnCount);
      existingIds.add(callId);
      imported++;
    } catch (err) {
      errors++;
      console.error(`Error on ${m.transcript_file}: ${err.message}`);
    }
  }

  console.log(`\nDone.`);
  console.log(`  Imported : ${imported}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errors}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
