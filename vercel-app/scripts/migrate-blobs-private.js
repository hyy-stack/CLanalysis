#!/usr/bin/env node

/**
 * Migration script: Copy blobs from public store to a new private store.
 *
 * Since you can't convert a public Vercel Blob store to private, this script:
 *   1. Downloads content from the old public store
 *   2. Re-uploads to the new private store
 *   3. Updates the blob_url in the database
 *   4. Deletes the blob from the old public store
 *
 * Requires two env vars for blob tokens:
 *   PRIVATE_BLOB_READ_WRITE_TOKEN - The NEW private store token (used for uploads)
 *   BLOB_READ_WRITE_TOKEN         - The OLD public store token (used for deletes)
 *
 * Usage:
 *   node scripts/migrate-blobs-private.js [--dry-run] [--limit N]
 *
 * Requires .env.local with POSTGRES_URL and both BLOB tokens.
 */

// Load env before importing SDKs
require('dotenv').config({ path: '.env.local' });

const { put, del } = require('@vercel/blob');
const { createPool } = require('@vercel/postgres');

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const idx = process.argv.indexOf('--limit');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : Infinity;
})();

const pool = createPool();

const PUBLIC_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PRIVATE_TOKEN = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;

if (!PUBLIC_TOKEN) {
  console.error('Error: BLOB_READ_WRITE_TOKEN is required (old public store token)');
  process.exit(1);
}
if (!PRIVATE_TOKEN) {
  console.error('Error: PRIVATE_BLOB_READ_WRITE_TOKEN is required (new private store token)');
  process.exit(1);
}

async function downloadPublicBlob(blobUrl) {
  const response = await fetch(blobUrl);
  if (!response.ok) {
    throw new Error(`Failed to download blob: ${response.status}`);
  }
  return await response.text();
}

function getPathname(blobUrl) {
  const url = new URL(blobUrl);
  // Remove leading slash
  return url.pathname.slice(1);
}

function getContentType(blobUrl) {
  if (blobUrl.includes('/transcripts/')) return 'application/json';
  if (blobUrl.includes('/emails/')) return 'text/plain';
  return 'application/octet-stream';
}

async function migrateTable(table, urlColumn, limit) {
  console.log(`\n=== Migrating ${table} ===`);

  const { rows } = await pool.query(
    `SELECT id, ${urlColumn} FROM ${table} WHERE ${urlColumn} IS NOT NULL`
  );

  console.log(`Found ${rows.length} rows with blob URLs`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  const rowsToProcess = rows.slice(0, limit);

  for (const row of rowsToProcess) {
    const oldUrl = row[urlColumn];
    const id = row.id;

    try {
      // Skip if already in the private store
      if (oldUrl.includes('.private.blob.')) {
        console.log(`  [skip] ${table}#${id} - already in private store`);
        skipped++;
        continue;
      }

      console.log(`  [migrate] ${table}#${id}: ${oldUrl.substring(0, 80)}...`);

      if (DRY_RUN) {
        migrated++;
        continue;
      }

      // Download from public store
      const content = await downloadPublicBlob(oldUrl);
      const pathname = getPathname(oldUrl);
      const contentType = getContentType(oldUrl);

      // Upload to private store
      const newBlob = await put(pathname, content, {
        access: 'private',
        contentType,
        token: PRIVATE_TOKEN,
      });

      // Update database
      await pool.query(
        `UPDATE ${table} SET ${urlColumn} = $1 WHERE id = $2`,
        [newBlob.url, id]
      );

      // Delete from old public store
      await del(oldUrl, { token: PUBLIC_TOKEN });

      migrated++;
      console.log(`    → migrated to ${newBlob.url.substring(0, 80)}...`);
    } catch (error) {
      failed++;
      console.error(`  [error] ${table}#${id}: ${error.message}`);
    }
  }

  console.log(`\n${table} results: ${migrated} migrated, ${skipped} skipped, ${failed} failed`);
  return { migrated, skipped, failed };
}

async function main() {
  if (DRY_RUN) {
    console.log('=== DRY RUN MODE — no changes will be made ===\n');
  }
  if (LIMIT !== Infinity) {
    console.log(`Limiting to ${LIMIT} total blobs\n`);
  }

  let remaining = LIMIT;
  const interactions = await migrateTable('interactions', 'blob_url', remaining);
  remaining -= interactions.migrated + interactions.skipped + interactions.failed;
  const emails = await migrateTable('manual_emails', 'blob_url', Math.max(0, remaining));

  const total = {
    migrated: interactions.migrated + emails.migrated,
    skipped: interactions.skipped + emails.skipped,
    failed: interactions.failed + emails.failed,
  };

  console.log(`\n=== TOTAL: ${total.migrated} migrated, ${total.skipped} skipped, ${total.failed} failed ===`);

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run without --dry-run to apply changes.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
