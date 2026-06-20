import { NextRequest, NextResponse } from 'next/server';
import { scrapePage } from '@/lib/scraper';
import { findPriceComparisons, PriceComparison } from '@/lib/wire';
import { generatePriceVerdict, extractProductInfo, verifyProductMatch } from '@/lib/groq';
import { buildTrendSignal } from '@/lib/trends';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { url, productNameOverride } = await req.json();
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

    const scraped = await scrapePage(url);
    if (!scraped.success) {
      return NextResponse.json({ error: `Could not scrape product page: ${scraped.error}` }, { status: 422 });
    }

    const rawFallbackName = scraped.metadata?.title ?? 'Unknown Product';
    const cleanInfo = await extractProductInfo(scraped.content ?? '', url, rawFallbackName);

    const productName = productNameOverride ?? cleanInfo.name ?? rawFallbackName;
    const categoryTerm = cleanInfo.category?.trim() || productName;

    let anchorPrice = cleanInfo.price;
    if (anchorPrice === null) {
      const rawPrice = scraped.metadata?.price?.replace(/[^0-9.]/g, '') ?? '0';
      anchorPrice = parseFloat(rawPrice);
    }

    const currency = cleanInfo.currency && cleanInfo.currency !== 'USD'
      ? cleanInfo.currency
      : (scraped.metadata?.currency?.includes('USD') ? 'USD' : (scraped.metadata?.currency ?? 'USD'));

    const retailerMatch = url.match(/(?:www\.)?([a-zA-Z0-9-]+)\./);
    const retailer = retailerMatch ? retailerMatch[1].charAt(0).toUpperCase() + retailerMatch[1].slice(1) : 'Retailer';

    const anchorProduct = { name: productName, price: anchorPrice, currency, retailer };

    function normalizeToUSD(price: number, curr: string) {
      const norm = curr.toUpperCase();
      if (norm === 'INR' || norm === '₹') return price / 94.31;
      if (norm === 'EUR' || norm === '€') return price * (108.16 / 94.31);
      if (norm === 'GBP' || norm === '£') return price * 1.25;
      return price;
    }

    const anchorNormalizedUSD = normalizeToUSD(anchorPrice, currency);

    const [rawComparisons, trend] = await Promise.all([
      findPriceComparisons(productName).catch(() => []),
      buildTrendSignal(productName, categoryTerm).catch(e => {
        console.error('[Trends] buildTrendSignal failed:', e);
        return {
          status: 'unavailable' as const,
          unavailableMessage: 'Trend data unavailable for this product',
          primary: null,
          secondary: null,
          risingQueries: [],
        };
      }),
    ]);

    // Product Match Verification
    const verifiedComparisons: (PriceComparison & { normalizedPriceUSD: number; isVariant?: boolean })[] = [];
    await Promise.all(
      rawComparisons.map(async (comp) => {
        const matchResult = await verifyProductMatch(productName, comp.name);
        if (matchResult.isMatch) {
          verifiedComparisons.push({
            ...comp,
            normalizedPriceUSD: normalizeToUSD(comp.price, comp.currency),
            isVariant: matchResult.isVariant ?? false,
          });
        } else {
          console.log(`[Price Match] Excluded ${comp.retailer} result: "${comp.name}". Reason: ${matchResult.reason}`);
        }
      })
    );

    // Provide LLM with original + normalized so it can format the summary well
    const anchorProductWithNorm = { ...anchorProduct, normalizedPriceUSD: anchorNormalizedUSD };

    const verdict = (anchorPrice > 0 || verifiedComparisons.length > 0)
      ? await generatePriceVerdict(anchorProductWithNorm, verifiedComparisons).catch(e => ({
          verdict: 'Average' as const,
          verdictColor: 'yellow' as const,
          reasoning: 'Could not generate verdict.',
          summary: String(e),
        }))
      : {
          verdict: 'Average' as const,
          verdictColor: 'yellow' as const,
          reasoning: 'Could not extract price from the product page.',
          summary: 'We were unable to determine if this is a good deal because the price could not be extracted.',
        };

    return NextResponse.json({
      product: {
        name: productName,
        price: anchorPrice,
        currency,
        normalizedPriceUSD: anchorNormalizedUSD,
        retailer,
        imageUrl: scraped.metadata?.image,
        url,
        category: categoryTerm,
      },
      comparisons: verifiedComparisons,
      verdict,
      trend,
      scraped: {
        contentLength: scraped.content?.length ?? 0,
        metadata: scraped.metadata,
      },
    });
  } catch (e) {
    console.error('[/api/analyze]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
