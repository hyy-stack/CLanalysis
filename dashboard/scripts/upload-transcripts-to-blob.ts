/**
 * Upload local transcript JSON files to Vercel Blob and update interactions.blob_url.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/upload-transcripts-to-blob.ts <path-to-transcripts-dir>
 *
 * Only uploads transcripts that are already in the interactions table (matched by callId).
 * Safe to re-run — skips any already uploaded (blob_url not a placeholder).
 */

import { put } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import { resolve, join } from 'path';
import { readdirSync, readFileSync, statSync } from 'fs';

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/upload-transcripts-to-blob.ts <dir>');
  process.exit(1);
}

const dir = resolve(dirArg);
if (!statSync(dir).isDirectory()) {
  console.error(`${dir} is not a directory`);
  process.exit(1);
}

async function main() {
  // Fetch all interactions that still have placeholder blob_urls
  const { rows } = await sql.query<{ id: string; external_id: string }>(
    `SELECT id, external_id FROM interactions
     WHERE type = 'call' AND blob_url LIKE 'imported://transcripts/%'`
  );

  console.log(`\nFound ${rows.length} interactions with placeholder blob URLs\n`);

  // Build a map: callId → file path
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const callIdToFile = new Map<string, string>();
  for (const f of files) {
    try {
      const raw = readFileSync(join(dir, f), 'utf-8');
      const parsed = JSON.parse(raw) as { callId?: string };
      if (parsed.callId) callIdToFile.set(parsed.callId, join(dir, f));
    } catch {
      // skip unparseable files
    }
  }

  console.log(`Indexed ${callIdToFile.size} transcript files\n`);

  let uploaded = 0;
  let missing = 0;
  let errors = 0;

  for (const row of rows) {
    const callId = row.external_id;
    const filePath = callIdToFile.get(callId);

    if (!filePath) {
      missing++;
      continue;
    }

    try {
      const content = readFileSync(filePath);

      const blob = await put(`transcripts/${callId}.json`, content, {
        access: 'private',
        contentType: 'application/json',
      });

      await sql.query(
        `UPDATE interactions SET blob_url = $1 WHERE id = $2`,
        [blob.url, row.id]
      );

      process.stdout.write(`\r  Uploaded ${++uploaded} / ${rows.length - missing} ...`);
    } catch (err) {
      console.error(`\n  ❌ ${callId}: ${err instanceof Error ? err.message : err}`);
      errors++;
    }
  }

  console.log(`\n\n─────────────────────────────`);
  console.log(`✅ Uploaded:  ${uploaded}`);
  if (missing) console.log(`⚠️  No file:   ${missing}`);
  if (errors)  console.log(`❌ Errors:    ${errors}`);
  console.log(`─────────────────────────────\n`);

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
