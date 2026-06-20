import { NextRequest, NextResponse } from 'next/server';
import { scrapePage } from '@/lib/scraper';
import { extractReturnSteps } from '@/lib/groq';

// Pre-tested retailer policy pages
const RETAILER_POLICY_URLS: Record<string, { cancel: string; return: string; name: string }> = {
  amazon: {
    name: 'Amazon',
    cancel: 'https://www.amazon.com/gp/help/customer/display.html?nodeId=GFZ6MF8E2S4FSSSK',
    return: 'https://www.amazon.com/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKWX7',
  },
  bestbuy: {
    name: 'Best Buy',
    cancel: 'https://www.bestbuy.com/site/help-topics/order-cancellation/pcmcat338900050007.c',
    return: 'https://www.bestbuy.com/site/help-topics/return-exchange-policy/pcmcat260800050004.c',
  },
  walmart: {
    name: 'Walmart',
    cancel: 'https://www.walmart.com/help/article/cancel-a-walmart-order/b8ec37ba9aef4afebe5c9017e67e0d89',
    return: 'https://www.walmart.com/help/article/walmart-return-policy/1a4c5af79dc84af09f937d980d63f3d7',
  },
};

function detectRetailer(url: string): string | null {
  const lower = url.toLowerCase();
  for (const key of Object.keys(RETAILER_POLICY_URLS)) {
    if (lower.includes(key)) return key;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { url, intent = 'return', productName } = await req.json();
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

    const retailerKey = detectRetailer(url);

    if (!retailerKey) {
      return NextResponse.json({
        error: 'Retailer not supported',
        message: 'This retailer is not in the tested list. Supported: Amazon, Best Buy, Walmart.',
        supported: Object.values(RETAILER_POLICY_URLS).map(r => r.name),
      }, { status: 422 });
    }

    const retailerInfo = RETAILER_POLICY_URLS[retailerKey];
    const policyUrl = intent === 'cancel' ? retailerInfo.cancel : retailerInfo.return;

    // Scrape the policy page
    const scraped = await scrapePage(policyUrl);
    if (!scraped.success || !scraped.content) {
      return NextResponse.json({
        error: `Could not scrape ${retailerInfo.name} policy page`,
        policyUrl,
      }, { status: 422 });
    }

    // Extract steps + draft email via Groq
    const result = await extractReturnSteps(
      scraped.content,
      intent as 'cancel' | 'return',
      retailerInfo.name,
      productName
    );

    return NextResponse.json({
      ...result,
      policyUrl,
      retailerKey,
      supported: true,
    });
  } catch (e) {
    console.error('[/api/cancelreturn]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
