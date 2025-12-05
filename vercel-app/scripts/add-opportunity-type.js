/**
 * Migration: Add opportunity_type column to deals table
 * Run with: node scripts/add-opportunity-type.js
 */

const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { sql } = require('@vercel/postgres');

async function migrate() {
  console.log('🔄 Adding opportunity_type column to deals table...\n');
  
  try {
    // Add opportunity_type column
    await sql.query(`
      ALTER TABLE deals 
      ADD COLUMN IF NOT EXISTS opportunity_type VARCHAR(100);
    `);
    
    console.log('✅ opportunity_type column added successfully!');
    
    // Verify the column was added
    const result = await sql.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'deals'
      ORDER BY ordinal_position;
    `);
    
    console.log('\ndeals table columns:');
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

