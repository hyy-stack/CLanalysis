/**
 * Database migration script
 * Run with: node scripts/migrate.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { sql } = require('@vercel/postgres');

async function migrate() {
  console.log('🔄 Running database migration...\n');

  try {
    // Run incremental migrations FIRST (to add columns to existing tables)
    const migrationsDir = path.join(__dirname, '../lib/db/migrations');
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort(); // Sort to run in order

      if (migrationFiles.length > 0) {
        console.log('Running incremental migrations...\n');

        for (const file of migrationFiles) {
          const migrationPath = path.join(migrationsDir, file);
          const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

          console.log(`  Running ${file}...`);
          try {
            await sql.query(migrationSql);
            console.log(`  ✓ ${file} completed`);
          } catch (error) {
            // Ignore "already exists" errors for idempotent migrations
            if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
              console.log(`  ⚠️  ${file} - already applied`);
            } else {
              console.log(`  ❌ ${file} failed: ${error.message}`);
              throw error;
            }
          }
        }
        console.log('');
      }
    }

    // Read and execute full schema (creates tables if not exist, indexes, etc.)
    const schemaPath = path.join(__dirname, '../lib/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    console.log('Executing full schema...\n');

    try {
      // Execute the entire schema as one statement
      // Postgres can handle multiple statements separated by semicolons
      await sql.query(schema);
      console.log('✅ Schema executed successfully!\n');
    } catch (error) {
      // If that fails, it might be because tables already exist
      if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
        console.log('⚠️  Some objects already exist (this is OK)\n');
      } else {
        console.log(`❌ Error: ${error.message}\n`);
        throw error;
      }
    }

    // Verify tables were created
    console.log('Verifying tables...\n');
    const tables = await sql.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log('Tables in database:');
    tables.rows.forEach(row => {
      console.log(`  ✓ ${row.tablename}`);
    });

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();

