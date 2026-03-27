import { sql } from '@vercel/postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const migration = readFileSync(join(__dirname, 'extend-schema.sql'), 'utf-8');
  const statements = migration.split(';').filter(s => s.trim());

  for (const stmt of statements) {
    if (!stmt.trim()) continue;
    console.log(`Running: ${stmt.trim().substring(0, 80)}...`);
    await sql.query(stmt);
  }

  console.log('✅ Migration complete');
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
