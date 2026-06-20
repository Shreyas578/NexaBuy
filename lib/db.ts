import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

/**
 * Execute a parameterized query using Neon serverless driver.
 * Use $1, $2, ... placeholders (PostgreSQL style).
 */
export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const db = getSql();
  const rows = await db(sql, params ?? []);
  return rows as T[];
}
