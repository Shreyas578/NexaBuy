/**
 * NexaBuy DB init — PostgreSQL (Neon / Vercel Postgres)
 *
 * Usage:
 *   node db/init.js
 *
 * Requires DATABASE_URL in .env pointing to your Postgres instance.
 * Alternatively, paste the contents of db/schema.sql directly into
 * the Neon dashboard SQL editor — that's the easiest path on Vercel.
 */

const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

async function initDB() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found at project root');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const dbUrlLine = envContent.split('\n').find(l => l.startsWith('DATABASE_URL='));
  if (!dbUrlLine) {
    console.error('DATABASE_URL missing in .env');
    process.exit(1);
  }

  const dbUrl = dbUrlLine.split('=').slice(1).join('=').trim();
  const sql = neon(dbUrl);

  const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');

  // Split on semicolons, skip empty statements
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Running ${statements.length} SQL statements…`);
  for (const stmt of statements) {
    await sql(stmt);
    console.log(' ✓', stmt.slice(0, 60).replace(/\n/g, ' '));
  }

  console.log('\nDatabase initialized successfully.');
}

initDB().catch(e => {
  console.error('Init failed:', e);
  process.exit(1);
});
