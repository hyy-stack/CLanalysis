/**
 * Database migration script
 * Run with: node scripts/migrate.js
 */

const { sql } = require('@vercel/postgres');
const fs = require('fs');
const path = require('path');

async function migrate() {
  console.log('🔄 Running database migration...\n');
  
  try {
    // Read schema file
    const schemaPath = path.join(__dirname, '../lib/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    // Split into individual statements (rough split by semicolons)
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements\n`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comments
      if (statement.startsWith('--')) continue;
      
      console.log(`[${i + 1}/${statements.length}] Executing...`);
      
      try {
        await sql.query(statement);
        console.log('  ✓ Success\n');
      } catch (error) {
        // Some statements might fail if already exist (that's OK)
        if (error.message && error.message.includes('already exists')) {
          console.log('  ⚠️  Already exists (skipping)\n');
        } else {
          console.log(`  ❌ Error: ${error.message}\n`);
        }
      }
    }
    
    console.log('✅ Migration completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();

