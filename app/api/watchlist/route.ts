import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/db';
import { scrapePage } from '@/lib/scraper';
import { findPriceComparisons } from '@/lib/wire';
import { generatePriceVerdict, extractProductInfo } from '@/lib/groq';

const SESSION_COOKIE = 'nexabuy_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface WatchlistItem {
  id: number;
  session_id: string;
  url: string;
  product_name: string;
  price: number;
  currency: string;
  verdict: string;
  image_url: string;
  last_checked_at: string;
  created_at: string;
}

/** Get or create a session_id from the request cookie store. */
async function getSessionId(res: NextResponse): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing) return existing;

  const id = uuidv4();
  res.cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return id;
}

// GET /api/watchlist → list items for this session
export async function GET() {
  const res = NextResponse.json({});           // placeholder, rebuilt below
  const sessionId = await getSessionId(res);

  try {
    const items = await query<WatchlistItem>(
      'SELECT * FROM watchlist WHERE session_id = $1 ORDER BY created_at DESC',
      [sessionId]
    );
    const out = NextResponse.json({ items });
    out.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: COOKIE_MAX_AGE,
    });
    return out;
  } catch (e) {
    return NextResponse.json({ error: `DB error: ${e}` }, { status: 500 });
  }
}

// POST /api/watchlist → add item for this session
export async function POST(req: NextRequest) {
  const res = NextResponse.json({});
  const sessionId = await getSessionId(res);

  try {
    const { url, product_name, price, currency, verdict, image_url } = await req.json();
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

    await query(
      `INSERT INTO watchlist (session_id, url, product_name, price, currency, verdict, image_url, last_checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        sessionId,
        url,
        product_name ?? 'Unknown Product',
        price ?? 0,
        currency ?? 'USD',
        verdict ?? 'Unknown',
        image_url ?? null,
      ]
    );

    const items = await query<WatchlistItem>(
      'SELECT * FROM watchlist WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
      [sessionId]
    );
    const out = NextResponse.json({ success: true, item: items[0] });
    out.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: COOKIE_MAX_AGE,
    });
    return out;
  } catch (e) {
    return NextResponse.json({ error: `DB error: ${e}` }, { status: 500 });
  }
}

// PUT /api/watchlist → re-check price for item (session-scoped)
export async function PUT(req: NextRequest) {
  const res = NextResponse.json({});
  const sessionId = await getSessionId(res);

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Only allow re-checking items that belong to this session
    const items = await query<WatchlistItem>(
      'SELECT * FROM watchlist WHERE id = $1 AND session_id = $2',
      [id, sessionId]
    );
    if (!items[0]) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const item = items[0];

    // Re-scrape the product page
    const scraped = await scrapePage(item.url);
    const cleanInfo = await extractProductInfo(
      scraped.content ?? '',
      item.url,
      item.product_name
    ).catch(() => null);

    const newPrice = (() => {
      if (cleanInfo?.price != null && cleanInfo.price > 0) return cleanInfo.price;
      const raw = parseFloat((scraped.metadata?.price ?? '').replace(/[^0-9.]/g, ''));
      return raw > 0 ? raw : item.price;
    })();

    const newCurrency = cleanInfo?.currency ?? item.currency;

    // Re-run comparisons + verdict
    const comparisons = await findPriceComparisons(item.product_name).catch(() => []);
    const retailerMatch = item.url.match(/(?:www\.)?([a-zA-Z0-9-]+)\./);
    const retailer = retailerMatch ? retailerMatch[1] : 'Retailer';

    // Build normalized prices for verdict
    function normalizeToUSD(price: number, curr: string) {
      const norm = curr.toUpperCase();
      if (norm === 'INR' || norm === '₹') return price / 94.31;
      if (norm === 'EUR' || norm === '€') return price * 1.08;
      if (norm === 'GBP' || norm === '£') return price * 1.25;
      return price;
    }

    const comparisonsWithNorm = comparisons.map(c => ({
      ...c,
      normalizedPriceUSD: normalizeToUSD(c.price, c.currency),
    }));

    const verdict = await generatePriceVerdict(
      {
        name: item.product_name,
        price: newPrice,
        currency: newCurrency,
        retailer,
        normalizedPriceUSD: normalizeToUSD(newPrice, newCurrency),
      },
      comparisonsWithNorm
    ).catch(() => ({
      verdict: 'Average' as const,
      verdictColor: 'yellow' as const,
      reasoning: 'Check failed',
      summary: '',
    }));

    // Update DB
    await query(
      'UPDATE watchlist SET price = $1, currency = $2, verdict = $3, last_checked_at = NOW() WHERE id = $4 AND session_id = $5',
      [newPrice, newCurrency, verdict.verdict, id, sessionId]
    );

    const updated = await query<WatchlistItem>(
      'SELECT * FROM watchlist WHERE id = $1',
      [id]
    );
    const out = NextResponse.json({
      success: true,
      item: updated[0],
      priceChange: newPrice - item.price,
      verdict,
      comparisons,
    });
    out.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: COOKIE_MAX_AGE,
    });
    return out;
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/watchlist → remove item (session-scoped)
export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({});
  const sessionId = await getSessionId(res);

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Only delete items that belong to this session
    await query(
      'DELETE FROM watchlist WHERE id = $1 AND session_id = $2',
      [id, sessionId]
    );

    const out = NextResponse.json({ success: true });
    out.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: COOKIE_MAX_AGE,
    });
    return out;
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
