/**
 * Match recently synced calls that have no CRM ID against the CRM CSV,
 * using the same high-confidence logic as match-nodeal-transcripts.py.
 *
 * Queries the DB for interactions whose deal has no crm_id, reconstructs
 * the transcript-like data from DB fields, runs Python matching, then
 * updates the DB with matched crmIds.
 *
 * Usage:
 *   node scripts/match-unlinked-calls.mjs --crm ~/Downloads/crm_opportunities.csv
 *   node scripts/match-unlinked-calls.mjs --crm ~/Downloads/crm_opportunities.csv --days 7
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { WebSocket } from 'ws';
import { writeFile, unlink, mkdir, rm } from 'fs/promises';
import { createReadStream } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import readline from 'readline';

neonConfig.webSocketConstructor = WebSocket;

const DB_URL = 'postgresql://neondb_owner:npg_goT3tN1UZEYj@ep-floral-fog-ankqci7s-pooler.c-6.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, arr) => {
    if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const crmPath = args.crm?.replace('~', os.homedir());
const days = parseInt(args.days ?? '30', 10);
const scriptDir = path.dirname(new URL(import.meta.url).pathname);

if (!crmPath) {
  console.error('Usage: node scripts/match-unlinked-calls.mjs --crm <path-to-crm.csv> [--days N]');
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

async function readMatchesCsv(filePath) {
  const rows = [];
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    // CSV may have commas in quoted fields — simple split ok for our schema
    const cols = line.split(',');
    if (!headers) { headers = cols.map(h => h.trim()); continue; }
    const row = {};
    headers.forEach((h, i) => { row[h] = (cols[i] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

async function main() {
  // 1. Query unlinked interactions (deal has no crm_id), within last N days
  const { rows: unlinked } = await pool.query(
    `SELECT
       i.id, i.external_id, i.title, i.timestamp, i.participants,
       d.id AS deal_id
     FROM interactions i
     JOIN deals d ON d.id = i.deal_id
     WHERE i.type = 'call'
       AND (d.crm_id IS NULL OR d.crm_id = '')
       AND i.timestamp >= NOW() - ($1 || ' days')::interval
     ORDER BY i.timestamp DESC`,
    [days]
  );

  if (unlinked.length === 0) {
    console.log('No unlinked calls found — nothing to match.');
    await pool.end();
    return;
  }
  console.log(`Found ${unlinked.length} unlinked calls in the last ${days} days`);

  // 2. Write each as a minimal transcript JSON into a temp dir
  const tmpDir = path.join(os.tmpdir(), `gong-unlinked-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  for (const row of unlinked) {
    const participants = Array.isArray(row.participants) ? row.participants : [];
    const transcript = {
      callId: row.external_id ?? row.id,
      _metadata: { title: row.title ?? '', timestamp: row.timestamp },
      _participants: participants.map(p => ({
        name: p.name ?? '',
        affiliation: p.affiliation ?? '',
        emailAddress: p.email ?? '',
      })),
      turns: [],
    };
    // Use no_deal prefix so the Python script picks it up
    const fname = `no_deal_${row.external_id ?? row.id}.json`;
    await writeFile(path.join(tmpDir, fname), JSON.stringify(transcript));
  }

  // 3. Run Python matching script
  const matchesOut = path.join(os.tmpdir(), `gong-matches-${Date.now()}.csv`);
  const pyScript = path.join(scriptDir, 'match-nodeal-transcripts.py');
  console.log('Running Python matching script...');
  try {
    execSync(
      `python3 "${pyScript}" --transcripts "${tmpDir}" --crm "${crmPath}" --output "${matchesOut}"`,
      { stdio: 'inherit' }
    );
  } catch {
    console.error('Python matching script failed');
    await rm(tmpDir, { recursive: true, force: true });
    await pool.end();
    process.exit(1);
  }

  // 4. Read matches CSV
  const matches = (await readMatchesCsv(matchesOut)).filter(r => r.match_status === 'MATCH');
  console.log(`\nMatched: ${matches.length} of ${unlinked.length} calls`);

  if (matches.length === 0) {
    await rm(tmpDir, { recursive: true, force: true });
    await unlink(matchesOut).catch(() => {});
    await pool.end();
    return;
  }

  // Build call_id → match map (the fname is no_deal_CALLID.json)
  const matchMap = new Map();
  for (const m of matches) {
    const callId = m.call_id;
    matchMap.set(String(callId), m);
  }

  // 5. Update deals in DB with matched crmId
  let updated = 0;
  for (const row of unlinked) {
    const callId = String(row.external_id ?? row.id);
    const match = matchMap.get(callId);
    if (!match) continue;

    try {
      // Upsert the deal with crmId
      const { rows: dealRows } = await pool.query(
        `INSERT INTO deals (id, crm_id, name, account_name, stage, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
         ON CONFLICT (crm_id) DO UPDATE SET
           name         = COALESCE(EXCLUDED.name, deals.name),
           account_name = COALESCE(EXCLUDED.account_name, deals.account_name),
           stage        = COALESCE(EXCLUDED.stage, deals.stage),
           updated_at   = NOW()
         RETURNING id`,
        [match.crm_id, match.crm_account, match.crm_account, match.crm_stage]
      );
      const newDealId = dealRows[0].id;

      // Re-point the interaction to the matched deal
      await pool.query(
        `UPDATE interactions SET deal_id = $1 WHERE id = $2`,
        [newDealId, row.id]
      );

      // Delete old unlinked deal if it's now empty
      await pool.query(
        `DELETE FROM deals WHERE id = $1 AND NOT EXISTS (
           SELECT 1 FROM interactions WHERE deal_id = $1
         ) AND crm_id IS NULL`,
        [row.deal_id]
      );

      updated++;
    } catch (err) {
      console.error(`Error updating call ${callId}: ${err.message}`);
    }
  }

  console.log(`Updated: ${updated} calls linked to CRM deals`);

  // Cleanup
  await rm(tmpDir, { recursive: true, force: true });
  await unlink(matchesOut).catch(() => {});
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
