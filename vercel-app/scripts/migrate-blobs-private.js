#!/usr/bin/env node

/**
 * Migration script: Convert existing public Vercel Blobs to private.
 *
 * For each row in `interactions` and `manual_emails` that has a blob_url:
 *   1. Download content from the existing (public) URL via the Blob API
 *   2. Re-upload with access: 'private'
 *   3. Update the blob_url in the database
 *   4. Delete the old public blob
 *
 * Run AFTER deploying the code changes (private uploads + head()-based retrieval).
 *
 * Usage:
 *   node scripts/migrate-blobs-private.js [--dry-run]
 *
 * Requires .env.local with DATABASE_URL and BLOB_READ_WRITE_TOKEN.
 */

const { put, del, head } = require('@vercel/blob');

// Load env
require('dotenv').config({ path: '.env.local' });

const { createPool } = require('@vercel/postgres');

const DRY_RUN = process.argv.includes('--dry-run');

const pool = createPool({ connectionString: process.env.DATABASE_URL });

async function downloadBlob(blobUrl) {
  const metadata = await head(blobUrl);
  const response = await fetch(metadata.downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download blob: ${response.status}`);
  }
  return {
    content: await response.text(),
    contentType: metadata.contentType,
    pathname: metadata.pathname,
  };
}

async function migrateTable(table, urlColumn) {
  console.log(`\n=== Migrating ${table} ===`);

  const { rows } = await pool.query(
    `SELECT id, ${urlColumn} FROM ${table} WHERE ${urlColumn} IS NOT NULL`
  );

  console.log(`Found ${rows.length} rows with blob URLs`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const oldUrl = row[urlColumn];
    const id = row.id;

    try {
      // Check if already private by inspecting the URL pattern
      // Private blob URLs contain a token parameter
      if (oldUrl.includes('?')) {
        console.log(`  [skip] ${table}#${id} - URL already has parameters, likely already private`);
        skipped++;
        continue;
      }

      console.log(`  [migrate] ${table}#${id}: ${oldUrl.substring(0, 80)}...`);

      if (DRY_RUN) {
        migrated++;
        continue;
      }

      // Download existing content
      const { content, contentType, pathname } = await downloadBlob(oldUrl);

      // Re-upload as private
      const newBlob = await put(pathname, content, {
        access: 'private',
        contentType: contentType || 'application/octet-stream',
      });

      // Update database
      await pool.query(
        `UPDATE ${table} SET ${urlColumn} = $1 WHERE id = $2`,
        [newBlob.url, id]
      );

      // Delete old public blob
      await del(oldUrl);

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

  const interactions = await migrateTable('interactions', 'blob_url');
  const emails = await migrateTable('manual_emails', 'blob_url');

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
