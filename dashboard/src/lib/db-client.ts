import { Pool } from '@neondatabase/serverless';

// Single pool shared across all DB calls.
// Uses DATABASE_URL (standard Neon connection string) with POSTGRES_URL as fallback.
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error('No database connection string found. Set DATABASE_URL in environment variables.');
}

export const sql = new Pool({ connectionString });
