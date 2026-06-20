'use client';

interface Comparison {
  retailer: string;
  name?: string;
  price: number;
  currency: string;
  normalizedPriceUSD?: number;
  available: boolean;
  url?: string;
  isVariant?: boolean;
}

interface VerdictResult {
  verdict: 'Good Deal' | 'Average' | 'Wait';
  verdictColor: 'green' | 'yellow' | 'red';
  reasoning: string;
  summary: string;
}

interface Product {
  name: string;
  price: number;
  currency: string;
  normalizedPriceUSD?: number;
  retailer: string;
  imageUrl?: string;
  url: string;
}

interface Props {
  product: Product;
  comparisons: Comparison[];
  verdict: VerdictResult;
}

const VERDICT_EMOJI: Record<string, string> = {
  'Good Deal': '🟢',
  'Average': '🟡',
  'Wait': '🔴',
};

/** Format a price for display. Shows original currency; if non-USD also shows USD equivalent. */
function formatPrice(price: number, currency: string, normalizedUSD?: number): string {
  const sym = currency === 'USD' ? '$' : currency === 'INR' ? '₹' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : `${currency} `;
  const rawStr = `${sym}${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency !== 'USD' && normalizedUSD != null && normalizedUSD > 0) {
    return `${rawStr} (~$${normalizedUSD.toFixed(0)})`;
  }
  return rawStr;
}

export default function PriceCard({ product, comparisons, verdict }: Props) {
  const anchorNorm = product.normalizedPriceUSD ?? product.price;

  const allPrices = [
    {
      retailer: product.retailer,
      price: product.price,
      currency: product.currency,
      normalizedPriceUSD: anchorNorm,
      available: true,
      isAnchor: true,
      isVariant: false,
    },
    ...comparisons.map(c => ({
      ...c,
      normalizedPriceUSD: c.normalizedPriceUSD ?? c.price,
      isAnchor: false,
      isVariant: c.isVariant ?? false,
    })),
  ]
    .filter(p => p.price > 0)
    // Sort by normalized USD so INR prices don't dominate
    .sort((a, b) => a.normalizedPriceUSD - b.normalizedPriceUSD);

  const lowestNorm = allPrices[0]?.normalizedPriceUSD ?? 0;

  return (
    <div className="card fade-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.name}
            style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 8, background: 'rgba(255,255,255,0.06)', padding: 6, flexShrink: 0 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="section-label">💰 Price Reality Check</p>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.4, marginBottom: 8 }}>
            {product.name}
          </h2>
          <div className={`verdict-pill verdict-${verdict.verdictColor}`}>
            {VERDICT_EMOJI[verdict.verdict]} {verdict.verdict}
          </div>
        </div>
      </div>

      {/* Summary */}
      <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 20 }}>
        {verdict.summary}
      </p>

      {/* Price Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allPrices.map((item, i) => {
          const isLowest = item.normalizedPriceUSD === lowestNorm;
          const diff = lowestNorm > 0 ? ((item.normalizedPriceUSD - lowestNorm) / lowestNorm * 100) : 0;
          return (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 10,
                background: item.isAnchor ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${item.isAnchor ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: item.isAnchor ? '#93c5fd' : '#f1f5f9' }}>
                  {item.retailer}
                </span>
                {item.isAnchor && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                    (your link)
                  </span>
                )}
                {!item.isAnchor && item.isVariant && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#f59e0b', fontWeight: 400 }}>
                    ⚠ different variant
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: isLowest ? '#22c55e' : '#f1f5f9' }}>
                  {formatPrice(item.price, item.currency, item.normalizedPriceUSD)}
                </div>
                {diff > 0.5 && (
                  <div style={{ fontSize: 11, color: '#ef4444' }}>+{diff.toFixed(0)}% vs best</div>
                )}
                {isLowest && <div style={{ fontSize: 11, color: '#22c55e' }}>Lowest price</div>}
              </div>
              {!item.available && (
                <span className="badge badge-red" style={{ fontSize: 11 }}>Out of stock</span>
              )}
            </div>
          );
        })}
        {allPrices.length === 0 && (
          <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', padding: 20 }}>
            Could not extract price data. Price may require login.
          </p>
        )}
        {comparisons.length === 0 && allPrices.length > 0 && (
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>
            ⚠️ We couldn't find any confirmed competitor prices for this product.
          </p>
        )}
      </div>
    </div>
  );
}
