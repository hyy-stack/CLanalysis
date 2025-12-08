/**
 * Migration script to add owner_name column to deals table
 * Run with: node scripts/add-owner-name.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { sql } = require('@vercel/postgres');

async function migrate() {
  console.log('🔄 Adding owner_name column to deals table...\n');
  
  try {
    await sql`
      ALTER TABLE deals 
      ADD COLUMN IF NOT EXISTS owner_name VARCHAR(500);
    `;
    
    console.log('✅ Migration complete: owner_name column added to deals table');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();

