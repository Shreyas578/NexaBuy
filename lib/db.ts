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
 * The Neon driver exposes a tagged-template interface by default,
 * but also supports .query(sql, params) for dynamic strings.
 */
export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const db = getSql();
  // .query() accepts a plain string + params array — avoids the TemplateStringsArray constraint
  const result = await db.query(sql, params ?? []);
  return result.rows as T[];
}
