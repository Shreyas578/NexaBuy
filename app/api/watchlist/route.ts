import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { dbSelect, dbInsert, dbUpdate, dbDelete } from '@/lib/db';
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

function cookieOpts() {
  return { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: COOKIE_MAX_AGE };
}

async function getSessionId(): Promise<string> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? uuidv4();
}

function withSession(res: NextResponse, sessionId: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, sessionId, cookieOpts());
  return res;
}

// GET /api/watchlist → list items for this session
export async function GET() {
  const sessionId = await getSessionId();
  try {
    const items = await dbSelect<WatchlistItem>('watchlist',
      { session_id: sessionId },
      { orderBy: 'created_at', orderAsc: false }
    );
    return withSession(NextResponse.json({ items }), sessionId);
  } catch (e) {
    return NextResponse.json({ error: `DB error: ${e}` }, { status: 500 });
  }
}

// POST /api/watchlist → add item for this session
export async function POST(req: NextRequest) {
  const sessionId = await getSessionId();
  try {
    const { url, product_name, price, currency, verdict, image_url } = await req.json();
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

    const item = await dbInsert<WatchlistItem>('watchlist', {
      session_id: sessionId,
      url,
      product_name: product_name ?? 'Unknown Product',
      price: price ?? 0,
      currency: currency ?? 'USD',
      verdict: verdict ?? 'Unknown',
      image_url: image_url ?? null,
      last_checked_at: new Date().toISOString(),
    });

    return withSession(NextResponse.json({ success: true, item }), sessionId);
  } catch (e) {
    return NextResponse.json({ error: `DB error: ${e}` }, { status: 500 });
  }
}

// PUT /api/watchlist → re-check price for item (session-scoped)
export async function PUT(req: NextRequest) {
  const sessionId = await getSessionId();
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Only allow items belonging to this session
    const items = await dbSelect<WatchlistItem>('watchlist', { id, session_id: sessionId });
    if (!items[0]) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    const item = items[0];

    // Re-scrape
    const scraped = await scrapePage(item.url);
    const cleanInfo = await extractProductInfo(
      scraped.content ?? '', item.url, item.product_name
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

    function normalizeToUSD(p: number, curr: string) {
      const n = curr.toUpperCase();
      if (n === 'INR' || n === '₹') return p / 94.31;
      if (n === 'EUR' || n === '€') return p * 1.08;
      if (n === 'GBP' || n === '£') return p * 1.25;
      return p;
    }

    const comparisonsWithNorm = comparisons.map(c => ({
      ...c, normalizedPriceUSD: normalizeToUSD(c.price, c.currency),
    }));

    const verdict = await generatePriceVerdict(
      {
        name: item.product_name, price: newPrice, currency: newCurrency,
        retailer, normalizedPriceUSD: normalizeToUSD(newPrice, newCurrency),
      },
      comparisonsWithNorm
    ).catch(() => ({
      verdict: 'Average' as const, verdictColor: 'yellow' as const,
      reasoning: 'Check failed', summary: '',
    }));

    // Update
    const updated = await dbUpdate<WatchlistItem>('watchlist',
      { id, session_id: sessionId },
      { price: newPrice, currency: newCurrency, verdict: verdict.verdict, last_checked_at: new Date().toISOString() }
    );

    return withSession(NextResponse.json({
      success: true,
      item: updated[0],
      priceChange: newPrice - item.price,
      verdict,
      comparisons,
    }), sessionId);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/watchlist → remove item (session-scoped)
export async function DELETE(req: NextRequest) {
  const sessionId = await getSessionId();
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    await dbDelete('watchlist', { id, session_id: sessionId });
    return withSession(NextResponse.json({ success: true }), sessionId);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
