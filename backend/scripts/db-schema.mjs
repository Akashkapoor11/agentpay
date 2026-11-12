import fs from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}
const sql = await fs.readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});
try {
  await pool.query(sql);
  console.log('database schema applied');
} finally {
  await pool.end();
}
