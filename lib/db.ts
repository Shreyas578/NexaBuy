import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

/**
 * Execute a parameterized query.
 * Use $1, $2, ... placeholders (PostgreSQL style).
 *
 * db.query() without fullResults:true returns Record<string,any>[] directly.
 */
export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const db = getSql();
  const rows = await db.query(sql, params ?? []);
  return rows as unknown as T[];
}
