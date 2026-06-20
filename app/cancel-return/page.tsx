'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ReturnChecklist from '@/components/ReturnChecklist';

interface CancelResult {
  steps: string[];
  email: string;
  retailer: string;
  timeframe: string;
  policyUrl: string;
  supported?: boolean;
  message?: string;
  supported_retailers?: string[];
}

export default function CancelReturnPage() {
  const [url, setUrl] = useState('');
  const [intent, setIntent] = useState<'cancel' | 'return'>('return');
  const [productName, setProductName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CancelResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/cancelreturn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), intent, productName: productName.trim() || undefined }),
      });
      const data: CancelResult & { error?: string } = await res.json();
      if (!res.ok || data.error) {
        setError(data.message ?? data.error ?? 'Request failed');
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(8,10,15,0.8)', backdropFilter: 'blur(16px)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
            <Image src="/logo.png" alt="NexaBuy Logo" width={34} height={34} style={{ borderRadius: 8 }} />
            <span style={{ fontSize: 17, fontWeight: 800, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              NexaBuy
            </span>
          </Link>
          <Link href="/" className="btn btn-ghost btn-sm">← Back to Copilot</Link>
        </div>
      </header>

      <main className="container" style={{ padding: '48px 20px 80px', maxWidth: 720 }}>
        <div style={{ marginBottom: 40 }}>
          <span className="badge badge-yellow" style={{ marginBottom: 14 }}>Return & Cancel Assistant</span>
          <h1 style={{ fontSize: 'clamp(24px,4vw,38px)', fontWeight: 800, marginBottom: 12 }}>
            Get out cleanly — with a plan
          </h1>
          <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.6 }}>
            Paste your order URL and tell us what you want to do. We'll extract the exact steps from the retailer's official policy and draft the email for you.
          </p>
        </div>

        {/* Input Card */}
        <div className="card" style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                ORDER / ACCOUNT PAGE URL
              </label>
              <input
                id="order-url-input"
                className="input"
                placeholder="https://www.amazon.com/orders/..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                WHAT DO YOU WANT TO DO?
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['return', 'cancel'] as const).map(opt => (
                  <button
                    key={opt}
                    className={`btn ${intent === opt ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setIntent(opt)}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {opt === 'return' ? '↩️ Return item' : '🚫 Cancel order'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                PRODUCT NAME <span style={{ fontWeight: 400 }}>(optional, for the email draft)</span>
              </label>
              <input
                id="product-name-input"
                className="input"
                placeholder="e.g. Sony WH-1000XM5 Headphones"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                disabled={loading}
              />
            </div>
            <button
              id="get-steps-btn"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={loading || !url.trim()}
              style={{ justifyContent: 'center', padding: '14px', fontSize: 15 }}
            >
              {loading ? <><span className="spinner" /> Extracting steps…</> : '📋 Get steps'}
            </button>
          </div>
        </div>

        {/* Supported retailers note */}
        <div className="card" style={{ marginBottom: 24, background: 'rgba(59,130,246,0.04)' }}>
          <p style={{ fontSize: 13, color: '#64748b' }}>
            <strong style={{ color: '#93c5fd' }}>Tested retailers:</strong> Amazon, Best Buy, Walmart.
            Other retailers are not yet supported — the policy scrape is only guaranteed for these three.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="card" style={{ marginBottom: 24, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}>
            <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 8 }}>⚠️ {error}</p>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Make sure the URL is from Amazon (amazon.com), Best Buy (bestbuy.com), or Walmart (walmart.com).
            </p>
          </div>
        )}

        {/* Results */}
        {result && (
          <ReturnChecklist
            steps={result.steps}
            email={result.email}
            retailer={result.retailer}
            timeframe={result.timeframe}
            intent={intent}
            policyUrl={result.policyUrl}
          />
        )}
      </main>
    </div>
  );
}
