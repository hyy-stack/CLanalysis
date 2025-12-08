/**
 * Migration: Add metadata column to manual_emails
 * Run with: node scripts/migrate-manual-emails-metadata.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { sql } = require('@vercel/postgres');

async function migrate() {
  console.log('🔄 Running manual_emails metadata migration...\n');
  
  try {
    const migrationPath = path.join(__dirname, '../lib/db/migrations/add-manual-emails-metadata.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('Executing migration...\n');
    
    await sql.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('\nChanges made:');
    console.log('  ✓ Added metadata JSONB column to manual_emails');
    console.log('  ✓ Migrated existing |EXCLUDED flags to metadata');
    console.log('  ✓ Cleaned up import_batch_id values');
    console.log('  ✓ Added GIN index on metadata');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();

