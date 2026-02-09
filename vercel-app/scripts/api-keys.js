#!/usr/bin/env node
/**
 * API Key Management CLI
 *
 * Usage:
 *   node scripts/api-keys.js create --name "Sales Team" --by "admin@anrok.com"
 *   node scripts/api-keys.js list [--all]
 *   node scripts/api-keys.js revoke <key-id> [--by "admin@anrok.com"]
 */

const path = require('path');
const crypto = require('crypto');

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { sql } = require('@vercel/postgres');

const KEY_PREFIX = 'dak_';
const KEY_BYTES = 16; // 128 bits

function generateApiKey() {
  const randomPart = crypto.randomBytes(KEY_BYTES).toString('hex');
  const key = `${KEY_PREFIX}${randomPart}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 8);

  return { key, hash, prefix };
}

async function createKey(name, description, createdBy) {
  if (!name) {
    console.error('Error: --name is required');
    process.exit(1);
  }

  const { key, hash, prefix } = generateApiKey();

  try {
    const result = await sql`
      INSERT INTO api_keys (name, description, key_hash, key_prefix, created_by)
      VALUES (${name}, ${description || null}, ${hash}, ${prefix}, ${createdBy || null})
      RETURNING id, name, key_prefix, created_at
    `;

    const record = result.rows[0];

    console.log('\n✅ API key created successfully!\n');
    console.log('Key Details:');
    console.log(`  ID:      ${record.id}`);
    console.log(`  Name:    ${record.name}`);
    console.log(`  Created: ${record.created_at}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Copy this key now. It will not be shown again.\n');
    console.log(`  API Key: ${key}\n`);
    console.log('Usage:');
    console.log(`  curl -H "X-API-Key: ${key}" https://your-app.vercel.app/api/analyze-deal\n`);
  } catch (error) {
    console.error('Error creating API key:', error.message);
    process.exit(1);
  }
}

async function listKeys(includeRevoked) {
  try {
    let result;

    if (includeRevoked) {
      result = await sql`
        SELECT id, name, description, key_prefix, created_by, created_at, last_used_at, revoked_at, revoked_by
        FROM api_keys
        ORDER BY created_at DESC
      `;
    } else {
      result = await sql`
        SELECT id, name, description, key_prefix, created_by, created_at, last_used_at
        FROM api_keys
        WHERE revoked_at IS NULL
        ORDER BY created_at DESC
      `;
    }

    if (result.rows.length === 0) {
      console.log('\nNo API keys found.\n');
      return;
    }

    console.log(`\n${includeRevoked ? 'All' : 'Active'} API Keys (${result.rows.length}):\n`);

    for (const row of result.rows) {
      const status = row.revoked_at ? '❌ REVOKED' : '✅ Active';
      const lastUsed = row.last_used_at
        ? new Date(row.last_used_at).toISOString().split('T')[0]
        : 'Never';

      console.log(`${status} ${row.key_prefix}...`);
      console.log(`  ID:          ${row.id}`);
      console.log(`  Name:        ${row.name}`);
      if (row.description) {
        console.log(`  Description: ${row.description}`);
      }
      console.log(`  Created:     ${new Date(row.created_at).toISOString().split('T')[0]}${row.created_by ? ` by ${row.created_by}` : ''}`);
      console.log(`  Last Used:   ${lastUsed}`);
      if (row.revoked_at) {
        console.log(`  Revoked:     ${new Date(row.revoked_at).toISOString().split('T')[0]}${row.revoked_by ? ` by ${row.revoked_by}` : ''}`);
      }
      console.log('');
    }
  } catch (error) {
    console.error('Error listing API keys:', error.message);
    process.exit(1);
  }
}

async function revokeKey(keyId, revokedBy) {
  if (!keyId) {
    console.error('Error: Key ID is required');
    console.error('Usage: node scripts/api-keys.js revoke <key-id>');
    process.exit(1);
  }

  try {
    // Check if key exists and is not already revoked
    const existing = await sql`
      SELECT id, name, key_prefix, revoked_at
      FROM api_keys
      WHERE id = ${keyId}
    `;

    if (existing.rows.length === 0) {
      console.error(`Error: API key with ID "${keyId}" not found`);
      process.exit(1);
    }

    const key = existing.rows[0];

    if (key.revoked_at) {
      console.error(`Error: API key "${key.name}" (${key.key_prefix}...) is already revoked`);
      process.exit(1);
    }

    // Revoke the key
    await sql`
      UPDATE api_keys
      SET revoked_at = NOW(), revoked_by = ${revokedBy || null}
      WHERE id = ${keyId}
    `;

    console.log(`\n✅ API key revoked successfully!\n`);
    console.log(`  Name:   ${key.name}`);
    console.log(`  Prefix: ${key.key_prefix}...`);
    console.log(`  ID:     ${key.id}`);
    console.log('');
    console.log('This key will no longer authenticate requests.\n');
  } catch (error) {
    console.error('Error revoking API key:', error.message);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
API Key Management CLI

Usage:
  node scripts/api-keys.js <command> [options]

Commands:
  create    Create a new API key
  list      List API keys
  revoke    Revoke an API key

Create Options:
  --name <name>          Name for the key (required)
  --description <desc>   Optional description
  --by <email>           Who is creating this key

List Options:
  --all                  Include revoked keys

Revoke Options:
  <key-id>              ID of the key to revoke (required)
  --by <email>          Who is revoking this key

Examples:
  node scripts/api-keys.js create --name "Sales Team" --by "admin@anrok.com"
  node scripts/api-keys.js list
  node scripts/api-keys.js list --all
  node scripts/api-keys.js revoke 123e4567-e89b-12d3-a456-426614174000 --by "admin@anrok.com"
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Parse arguments
  const options = {};
  let positionalArgs = [];

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      // Check if next arg is a value (not a flag)
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        options[key] = args[i + 1];
        i++;
      } else {
        options[key] = true;
      }
    } else {
      positionalArgs.push(args[i]);
    }
  }

  switch (command) {
    case 'create':
      await createKey(options.name, options.description, options.by);
      break;
    case 'list':
      await listKeys(options.all);
      break;
    case 'revoke':
      await revokeKey(positionalArgs[0], options.by);
      break;
    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;
    default:
      if (command) {
        console.error(`Unknown command: ${command}\n`);
      }
      printUsage();
      process.exit(command ? 1 : 0);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
