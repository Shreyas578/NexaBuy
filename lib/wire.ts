/**
 * Wire API wrapper — catalog discovery + task execution.
 * Always check catalog before assuming an action exists.
 * Base URL: https://api.anakin.io/v1/wire
 */

const WIRE_BASE_URL = process.env.WIRE_BASE_URL ?? 'https://api.anakin.io/v1/wire';

function wireHeaders() {
  const key = process.env.WIRE_API_KEY;
  if (!key) throw new Error('WIRE_API_KEY not set');
  return {
    'X-API-Key': key,
    'Content-Type': 'application/json',
  };
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface WireAction {
  id: string;
  action_id?: string;
  name: string;
  description?: string;
  params?: Record<string, unknown>;
}

export interface WireCatalogResult {
  found: boolean;
  actions: WireAction[];
  error?: string;
}

export async function getCatalog(service: string): Promise<WireCatalogResult> {
  try {
    const res = await fetch(`${WIRE_BASE_URL}/catalog/${encodeURIComponent(service)}`, {
      headers: wireHeaders(),
    });
    if (res.status === 404) return { found: false, actions: [] };
    if (!res.ok) {
      const text = await res.text();
      return { found: false, actions: [], error: `Wire catalog error ${res.status}: ${text}` };
    }
    const data = await res.json();
    // Wire may return { actions: [...] } or an array directly
    const actions: WireAction[] = Array.isArray(data) ? data : (data.actions ?? []);
    return { found: true, actions };
  } catch (e) {
    return { found: false, actions: [], error: String(e) };
  }
}

// ─── Task Execution ───────────────────────────────────────────────────────────

export interface WireTaskResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function runTaskOnce<T = unknown>(
  action_id: string,
  params: Record<string, unknown>
): Promise<WireTaskResult<T>> {
  const res = await fetch(`${WIRE_BASE_URL}/task`, {
    method: 'POST',
    headers: wireHeaders(),
    body: JSON.stringify({ action_id, params }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[Wire Task/${action_id}] POST failed (${res.status}):`, text);
    return { success: false, error: `Wire task error ${res.status}: ${text}` };
  }
  const data = await res.json();

  // Wire jobs are asynchronous, poll if we have a job_id
  if (data.status === 'processing' && data.job_id) {
    let attempts = 0;
    let jobData = data;
    while (jobData.status === 'processing' && attempts < 15) {
      await new Promise(r => setTimeout(r, 2000));
      const pollUrl = jobData.poll_url ? `https://api.anakin.io${jobData.poll_url}` : `${WIRE_BASE_URL}/jobs/${data.job_id}`;
      const pollRes = await fetch(pollUrl, { headers: wireHeaders() });
      if (!pollRes.ok) throw new Error(`Polling failed: ${pollRes.status}`);
      jobData = await pollRes.json();
      attempts++;
    }
    if (jobData.status === 'processing') throw new Error('Wire task timed out');
    if (jobData.status === 'error' || jobData.status === 'failed') {
      throw new Error(jobData.error?.message || 'Wire task failed');
    }
    const unwrapped = jobData.data?.data?.data?.points ?? jobData.data?.data?.data ?? jobData.data?.data ?? jobData.data;
    console.log(`[Wire Task/${action_id}] Success response:`, JSON.stringify(jobData, null, 2));
    return { success: true, data: unwrapped as T };
  }

  const unwrappedSync = data.data?.data?.data?.points ?? data.data?.data?.data ?? data.data?.data ?? data.data ?? data;
  console.log(`[Wire Task/${action_id}] Sync success response:`, JSON.stringify(data, null, 2));
  return { success: true, data: unwrappedSync as T };
}

export async function runTask<T = unknown>(
  action_id: string,
  params: Record<string, unknown>
): Promise<WireTaskResult<T>> {
  try {
    return await runTaskOnce<T>(action_id, params);
  } catch (e) {
    const msg = String(e);
    if (msg.includes('timed out')) {
      console.warn(`[Wire Task/${action_id}] Timed out — retrying once after 2s`);
      await new Promise(r => setTimeout(r, 2000));
      try {
        return await runTaskOnce<T>(action_id, params);
      } catch (retryErr) {
        console.error(`[Wire Task/${action_id}] Retry also failed:`, retryErr);
        return { success: false, error: String(retryErr) };
      }
    }
    console.error(`[Wire Task/${action_id}] Exception:`, e);
    return { success: false, error: msg };
  }
}

// ─── Price Comparison ─────────────────────────────────────────────────────────

export interface PriceComparison {
  retailer: string;
  name: string;
  price: number;
  currency: string;
  available: boolean;
  url?: string;
  source: 'wire' | 'unavailable';
}

/**
 * Infer the most likely currency for a retailer when the API response
 * doesn't return an explicit currency field.
 * Flipkart is India-only → INR; most others default to USD.
 */
function inferCurrency(service: string, rawCurrency: string | null | undefined): string {
  if (rawCurrency && rawCurrency.trim() && rawCurrency.toUpperCase() !== 'UNKNOWN') {
    return rawCurrency.trim().toUpperCase();
  }
  const s = service.toLowerCase();
  if (s === 'flipkart') return 'INR';
  if (s === 'amazon_in' || s === 'amazon.in') return 'INR';
  return 'USD';
}

/**
 * Build a tighter search query from a product name.
 * Keeps brand + model number tokens (alphanumerics with digits) and drops
 * generic SEO filler, giving retailer search engines a better signal.
 * e.g. "Samsung Galaxy M56 5G (8GB/256GB) – Best Smartphone" → "Samsung Galaxy M56 5G"
 */
function buildPreciseQuery(productName: string): string {
  // Strip anything after common separators that introduce filler
  const stripped = productName
    .replace(/[–—|]/g, ' ')          // em-dash / pipe separators
    .replace(/\(.*?\)/g, ' ')        // parenthetical specs like (8GB/256GB)
    .replace(/\[.*?\]/g, ' ')        // bracket content
    .split(/[,;]/)[0]                // take only the first clause
    .trim();

  // Keep only the first 6 words — brand + model is almost always front-loaded
  const words = stripped.split(/\s+/).filter(Boolean).slice(0, 6);
  return words.join(' ');
}

const COMPARISON_SERVICES = ['amazon', 'walmart', 'ebay', 'flipkart', 'newegg'];

export async function findPriceComparisons(
  productName: string
): Promise<PriceComparison[]> {
  const results: PriceComparison[] = [];
  const preciseQuery = buildPreciseQuery(productName);

  for (const service of COMPARISON_SERVICES) {
    const catalog = await getCatalog(service);
    if (!catalog.found || catalog.actions.length === 0) continue;

    // Look for a search action, specifically excluding 'detail' actions
    const action = catalog.actions.find(a => {
      const id = (a.action_id || a.id || '').toLowerCase();
      const name = a.name.toLowerCase();
      return (id.includes('search') || name.includes('search')) && !id.includes('detail');
    }) ?? catalog.actions.find(a => {
      const id = (a.action_id || a.id || '').toLowerCase();
      return id.includes('price') && !id.includes('detail');
    }) ?? catalog.actions[0];

    if (!action) continue;

    const actionIdToRun = action.action_id || action.id;

    // Try precise query first; fall back to full product name if it yields nothing
    let result = await runTask(actionIdToRun, { query: preciseQuery, limit: 1 });

    const isEmpty = (r: WireTaskResult) => {
      if (!r.success || !r.data) return true;
      const d = r.data as Record<string, unknown>;
      const items = (d.items ?? d.results ?? d.products ?? d.listings ?? [d]) as unknown[];
      return items.length === 0 || items[0] == null;
    };

    // Retry once if the call succeeded but returned no usable data (API flakiness)
    if (result.success && isEmpty(result)) {
      console.warn(`[Price Comparison/${service}] Empty result for precise query — retrying once after 2s`);
      await new Promise(r => setTimeout(r, 2000));
      result = await runTask(actionIdToRun, { query: preciseQuery, limit: 1 });
    }

    // If precise query still empty, fall back to full product name
    if (isEmpty(result) && preciseQuery !== productName) {
      console.warn(`[Price Comparison/${service}] Precise query empty — falling back to full product name`);
      result = await runTask(actionIdToRun, { query: productName, limit: 1 });
    }

    if (!result.success || !result.data) continue;

    // Parse result — Wire responses vary; try common shapes
    const d = result.data as Record<string, unknown>;
    const items = (d.items ?? d.results ?? d.products ?? d.listings ?? [d]) as Record<string, unknown>[];
    const first = items[0];
    if (!first) continue;

    const price = parseFloat(
      String(first.price ?? first.current_price ?? first.salePrice ?? '0')
        .replace(/[^0-9.]/g, '')
    );
    if (!price) continue;

    const name = String(first.title ?? first.name ?? first.query ?? productName);
    const currency = inferCurrency(service, String(first.currency ?? first.currencyCode ?? ''));

    results.push({
      retailer: service.charAt(0).toUpperCase() + service.slice(1),
      name,
      price,
      currency,
      available: first.available !== false && first.in_stock !== false,
      url: String(first.url ?? first.link ?? first.item_url ?? ''),
      source: 'wire',
    });

    if (results.length >= 5) break; // Cap at 5 comparisons
  }

  return results;
}

// ─── Google Trends ────────────────────────────────────────────────────────────

export interface TrendsData {
  keyword: string;
  timelineData?: Array<{ date: string; value: number }>;
  averageValue?: number;
  trend?: string;
  raw?: unknown;
}

export interface TrendsFetchLog {
  label: string;
  keyword: string;
  actionId?: string;
  httpStatus?: number;
  body: unknown;
  error?: string;
}

export interface TrendsFetchResult {
  keyword: string;
  label: 'product' | 'category';
  success: boolean;
  data: TrendsData | null;
  error?: string;
  log: TrendsFetchLog;
  rawBody?: unknown;
}

let cachedTrendsCatalog: WireCatalogResult | null = null;

async function getTrendsCatalog(): Promise<WireCatalogResult> {
  if (cachedTrendsCatalog?.found) return cachedTrendsCatalog;
  cachedTrendsCatalog = await getCatalog('google_trends');
  return cachedTrendsCatalog;
}

function findTrendsSearchAction(actions: WireAction[]): WireAction | undefined {
  const exact = actions.find(a => (a.action_id || '').toLowerCase().includes('interest_over_time'));
  if (exact) return exact;

  return actions.find(a => {
    const id = (a.action_id || a.id || '').toLowerCase();
    const name = a.name.toLowerCase();
    return (id.includes('search') || name.includes('search')) && !id.includes('trending');
  }) ?? actions[0];
}

function findTrendsRisingAction(actions: WireAction[]): WireAction | undefined {
  return actions.find(a => {
    const id = (a.action_id || a.id || a.name).toLowerCase();
    return id.includes('rising') || id.includes('related') || id.includes('query');
  });
}

/** Run a Wire task and capture HTTP status + raw body for diagnostics. */
async function runTaskWithLogOnce<T = unknown>(
  action_id: string,
  params: Record<string, unknown>,
  logLabel: string
): Promise<{ result: WireTaskResult<T>; httpStatus?: number; rawBody: unknown }> {
  try {
    const res = await fetch(`${WIRE_BASE_URL}/task`, {
      method: 'POST',
      headers: wireHeaders(),
      body: JSON.stringify({ action_id, params }),
    });
    const httpStatus = res.status;
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      console.error(`[Wire Trends/${logLabel}] Task POST failed`, { httpStatus, body: parsed, action_id, params });
      return {
        result: { success: false, error: `Wire task error ${httpStatus}: ${text}` },
        httpStatus,
        rawBody: parsed,
      };
    }

    const data = parsed as Record<string, unknown>;

    if (data.status === 'processing' && data.job_id) {
      let attempts = 0;
      let jobData = data;
      while (jobData.status === 'processing' && attempts < 15) {
        await new Promise(r => setTimeout(r, 2000));
        const pollUrl = jobData.poll_url ? `https://api.anakin.io${jobData.poll_url}` : `${WIRE_BASE_URL}/jobs/${data.job_id}`;
        const pollRes = await fetch(pollUrl, {
          headers: wireHeaders(),
        });
        const pollText = await pollRes.text();
        let pollParsed: unknown;
        try {
          pollParsed = JSON.parse(pollText);
        } catch {
          pollParsed = pollText;
        }
        if (!pollRes.ok) {
          console.error(`[Wire Trends/${logLabel}] Poll failed`, { httpStatus: pollRes.status, body: pollParsed });
          return {
            result: { success: false, error: `Polling failed: ${pollRes.status}` },
            httpStatus: pollRes.status,
            rawBody: pollParsed,
          };
        }
        jobData = pollParsed as Record<string, unknown>;
        attempts++;
      }

      console.log(`[Wire Trends/${logLabel}] Job complete`, JSON.stringify({
        httpStatus,
        jobStatus: jobData.status,
        body: jobData,
        action_id,
        params,
      }, null, 2));

      if (jobData.status === 'processing') {
        return { result: { success: false, error: 'Wire task timed out' }, httpStatus, rawBody: jobData };
      }
      if (jobData.status === 'error' || jobData.status === 'failed') {
        const errMsg = (jobData.error as { message?: string })?.message || 'Wire task failed';
        return { result: { success: false, error: errMsg }, httpStatus, rawBody: jobData };
      }

      const unwrapped = (jobData.data as Record<string, unknown>)?.data?.data?.points ??
        (jobData.data as Record<string, unknown>)?.data?.data ??
        (jobData.data as Record<string, unknown>)?.data ??
        jobData.data;
      return { result: { success: true, data: unwrapped as T }, httpStatus, rawBody: jobData };
    }

    console.log(`[Wire Trends/${logLabel}] Sync response`, JSON.stringify({ httpStatus, body: parsed, action_id, params }, null, 2));

    const unwrappedSync = (data.data as Record<string, unknown>)?.data?.data?.points ??
      (data.data as Record<string, unknown>)?.data?.data ??
      (data.data as Record<string, unknown>)?.data ??
      data.data ??
      data;
    return { result: { success: true, data: unwrappedSync as T }, httpStatus, rawBody: parsed };
  } catch (e) {
    console.error(`[Wire Trends/${logLabel}] Exception`, e);
    return { result: { success: false, error: String(e) }, rawBody: { error: String(e) } };
  }
}

async function runTaskWithLog<T = unknown>(
  action_id: string,
  params: Record<string, unknown>,
  logLabel: string
): Promise<{ result: WireTaskResult<T>; httpStatus?: number; rawBody: unknown }> {
  const outcome = await runTaskWithLogOnce<T>(action_id, params, logLabel);
  // Retry once on timeout
  if (!outcome.result.success && String(outcome.result.error).includes('timed out')) {
    console.warn(`[Wire Trends/${logLabel}] Timed out — retrying once after 2s`);
    await new Promise(r => setTimeout(r, 2000));
    return runTaskWithLogOnce<T>(action_id, params, logLabel);
  }
  return outcome;
}

export async function fetchTrendForKeyword(
  keyword: string,
  label: 'product' | 'category'
): Promise<TrendsFetchResult> {
  const catalog = await getTrendsCatalog();
  if (!catalog.found || catalog.actions.length === 0) {
    const log: TrendsFetchLog = {
      label,
      keyword,
      body: catalog,
      error: catalog.error ?? 'google_trends catalog not found',
    };
    console.warn(`[Wire Trends/${label}] Catalog unavailable`, log);
    return { keyword, label, success: false, data: null, error: log.error, log };
  }

  const action = findTrendsSearchAction(catalog.actions);
  if (!action) {
    const log: TrendsFetchLog = { label, keyword, body: catalog.actions, error: 'No search action in catalog' };
    console.warn(`[Wire Trends/${label}] No search action`, log);
    return { keyword, label, success: false, data: null, error: log.error, log };
  }

  const actionId = action.action_id || action.id;
  const { result, httpStatus, rawBody } = await runTaskWithLog(
    actionId,
    { keyword, timeframe: 'today 12-m' },
    label
  );

  const log: TrendsFetchLog = {
    label,
    keyword,
    actionId,
    httpStatus,
    body: rawBody,
    error: result.error,
  };

  if (!result.success || result.data == null) {
    console.warn(`[Wire Trends/${label}] No data returned`, log);
    return { keyword, label, success: false, data: null, error: result.error, log, rawBody };
  }

  const data: TrendsData = {
    keyword,
    raw: result.data,
    ...(typeof result.data === 'object' && result.data !== null ? result.data as object : {}),
  };

  console.log(`[Wire Trends/${label}] Raw response`, JSON.stringify({ httpStatus, keyword, body: rawBody }, null, 2));

  return { keyword, label, success: true, data, log, rawBody };
}

/** @deprecated Use fetchTrendForKeyword via buildTrendSignal instead. */
export async function getTrends(productName: string): Promise<TrendsData | null> {
  const result = await fetchTrendForKeyword(productName, 'product');
  if (!result.success || !result.data) return null;
  return result.data;
}

function parseRisingQueriesFromRaw(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;

  const lists: unknown[] = [];
  if (Array.isArray(obj.rising)) lists.push(obj.rising);
  if (Array.isArray(obj.related_queries)) lists.push(obj.related_queries);
  if (Array.isArray(obj.queries)) lists.push(obj.queries);

  const related = obj.related;
  if (related && typeof related === 'object') {
    const r = related as Record<string, unknown>;
    if (Array.isArray(r.rising)) lists.push(r.rising);
    if (Array.isArray(r.top)) lists.push(r.top);
  }

  const defaultBlock = obj.default;
  if (defaultBlock && typeof defaultBlock === 'object') {
    lists.push(...parseRisingQueriesFromRaw(defaultBlock));
  }

  const terms: string[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === 'string') {
        terms.push(item);
      } else if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        const q = row.query ?? row.title ?? row.term ?? row.value;
        if (typeof q === 'string' && q.trim()) terms.push(q.trim());
      }
    }
  }

  return [...new Set(terms)];
}

export async function fetchRisingQueries(categoryKeyword: string): Promise<string[]> {
  const catalog = await getTrendsCatalog();
  if (!catalog.found || catalog.actions.length === 0) return [];

  const action = findTrendsRisingAction(catalog.actions);
  if (!action) return [];

  const actionId = action.action_id || action.id;
  const { result, httpStatus, rawBody } = await runTaskWithLog(
    actionId,
    { keyword: categoryKeyword, timeframe: 'today 12-m' },
    'rising'
  );

  console.log('[Wire Trends/rising] Raw response', JSON.stringify({ httpStatus, keyword: categoryKeyword, body: rawBody }, null, 2));

  if (!result.success || !result.data) return [];

  const queries = parseRisingQueriesFromRaw(result.data);
  return queries.length > 0 ? queries : [];
}

// ─── Store Stock ──────────────────────────────────────────────────────────────

export async function getStoreStock(
  storeName: string,
  productName: string
): Promise<{ price?: number; available?: boolean; source: 'wire' } | null> {
  const service = storeName.toLowerCase().replace(/\s+/g, '');
  const catalog = await getCatalog(service);
  if (!catalog.found || catalog.actions.length === 0) return null;

  const action = catalog.actions.find(a =>
    (a.action_id || '').toLowerCase().includes('stock') ||
    (a.action_id || '').toLowerCase().includes('availability') ||
    (a.action_id || '').toLowerCase().includes('store') ||
    (a.action_id || '').toLowerCase().includes('search') ||
    a.name.toLowerCase().includes('stock')
  ) ?? catalog.actions[0];

  if (!action) return null;

  const actionIdToRun = action.action_id || action.id;
  const result = await runTask(actionIdToRun, { query: productName, limit: 1 });
  if (!result.success || !result.data) return null;

  const d = result.data as Record<string, unknown>;
  const items = (d.items ?? d.results ?? [d]) as Record<string, unknown>[];
  const first = items[0];
  if (!first) return null;

  const price = parseFloat(String(first.price ?? '0').replace(/[^0-9.]/g, ''));
  return { price: price || undefined, available: first.available !== false, source: 'wire' };
}
