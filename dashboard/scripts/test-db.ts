import { sql } from '@vercel/postgres';

async function test() {
  try {
    const result = await sql`SELECT COUNT(*) FROM deals`;
    console.log('✅ Connected to live Vercel Postgres');
    console.log(`   Found ${result.rows[0].count} deals`);
  } catch (err) {
    console.error('❌ Database connection failed:', err);
  }
  process.exit(0);
}

test();
