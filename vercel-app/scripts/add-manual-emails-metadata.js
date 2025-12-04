/**
 * Migration: Add metadata column to manual_emails table
 * Run with: node scripts/add-manual-emails-metadata.js
 */

const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { sql } = require('@vercel/postgres');

async function migrate() {
  console.log('🔄 Adding metadata column to manual_emails table...\n');
  
  try {
    // Add metadata column
    await sql.query(`
      ALTER TABLE manual_emails 
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    `);
    
    console.log('✅ Metadata column added successfully!');
    
    // Verify the column was added
    const result = await sql.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'manual_emails'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nmanual_emails table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();

