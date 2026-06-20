/**
 * Supabase database client using PostgREST HTTP API.
 * No TCP/WebSocket needed — works on Vercel serverless out of the box.
 * Uses the service role key so RLS is bypassed (we enforce session scoping in code).
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseHeaders() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer': 'return=representation',
  };
}

function getBase() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return `${SUPABASE_URL}/rest/v1`;
}

// ─── PostgREST query builder ──────────────────────────────────────────────────

/**
 * SELECT rows from a table.
 * @param table  Table name
 * @param filters  e.g. { session_id: 'abc', id: 1 }  (all ANDed with eq)
 * @param opts  order / limit
 */
export async function dbSelect<T = unknown>(
  table: string,
  filters: Record<string, unknown> = {},
  opts: { orderBy?: string; orderAsc?: boolean; limit?: number } = {}
): Promise<T[]> {
  const params = new URLSearchParams();

  // Column filters → PostgREST eq. syntax
  for (const [col, val] of Object.entries(filters)) {
    params.set(col, `eq.${val}`);
  }

  if (opts.orderBy) {
    params.set('order', `${opts.orderBy}.${opts.orderAsc === false ? 'desc' : 'asc'}`);
  }
  if (opts.limit != null) {
    params.set('limit', String(opts.limit));
  }

  const url = `${getBase()}/${table}?${params.toString()}`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase select error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T[]>;
}

/**
 * INSERT a row. Returns the inserted row.
 */
export async function dbInsert<T = unknown>(
  table: string,
  row: Record<string, unknown>
): Promise<T> {
  const url = `${getBase()}/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase insert error ${res.status}: ${err}`);
  }
  const rows = await res.json() as T[];
  return rows[0];
}

/**
 * UPDATE rows matching filters. Returns updated rows.
 */
export async function dbUpdate<T = unknown>(
  table: string,
  filters: Record<string, unknown>,
  data: Record<string, unknown>
): Promise<T[]> {
  const params = new URLSearchParams();
  for (const [col, val] of Object.entries(filters)) {
    params.set(col, `eq.${val}`);
  }

  const url = `${getBase()}/${table}?${params.toString()}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: supabaseHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase update error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T[]>;
}

/**
 * DELETE rows matching filters.
 */
export async function dbDelete(
  table: string,
  filters: Record<string, unknown>
): Promise<void> {
  const params = new URLSearchParams();
  for (const [col, val] of Object.entries(filters)) {
    params.set(col, `eq.${val}`);
  }

  const url = `${getBase()}/${table}?${params.toString()}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase delete error ${res.status}: ${err}`);
  }
}
