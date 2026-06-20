'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import LoadingSteps from '@/components/LoadingSteps';
import PriceCard from '@/components/PriceCard';
import TrendCard from '@/components/TrendCard';
import WatchlistDrawer from '@/components/WatchlistDrawer';
import type { TrendSignalResult } from '@/lib/trends';

const NearbyMap = dynamic(() => import('@/components/NearbyMap'), { ssr: false });

interface AnalyzeResult {
  product: { name: string; price: number; currency: string; retailer: string; imageUrl?: string; url: string };
  comparisons: { retailer: string; price: number; currency: string; available: boolean; url?: string }[];
  verdict: { verdict: 'Good Deal'|'Average'|'Wait'; verdictColor: 'green'|'yellow'|'red'; reasoning: string; summary: string };
  trend: TrendSignalResult;
}

interface NearbyResult {
  geo: { lat: number; lng: number; displayName: string };
  stores: { id: number; name: string; lat: number; lng: number; address: string; phone?: string; hasLiveData: boolean; livePrice?: number; liveAvailable?: boolean }[];
}

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [location, setLocation] = useState('');
  const [loadingStep, setLoadingStep] = useState(-1);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [nearby, setNearby] = useState<NearbyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [watchlistRefresh, setWatchlistRefresh] = useState(0);
  const [watchAdded, setWatchAdded] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);

  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) return;
    setError(null);
    setResult(null);
    setNearby(null);
    setWatchAdded(false);
    setLoadingStep(0);

    try {
      // Step 0→1: scraping happens inside analyze
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      setLoadingStep(1);

      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok || analyzeData.error) {
        throw new Error(analyzeData.error ?? 'Analysis failed');
      }
      setLoadingStep(2);

      // Small artificial delay so users see step 2 (trends)
      await new Promise(r => setTimeout(r, 500));
      setLoadingStep(3);
      await new Promise(r => setTimeout(r, 400));

      setResult(analyzeData);
      setLoadingStep(-1);

      // Fire nearby search in background if location given
      if (location.trim()) {
        fetch('/api/nearby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: location.trim(), productName: analyzeData.product?.name }),
        }).then(r => r.json()).then(d => { if (d.stores) setNearby(d); }).catch(() => {});
      }
    } catch (e) {
      setError(String(e));
      setLoadingStep(-1);
    }
  }, [url, location]);

  const handleWatch = async () => {
    if (!result) return;
    setWatchLoading(true);
    try {
      await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: result.product.url,
          product_name: result.product.name,
          price: result.product.price,
          currency: result.product.currency,
          verdict: result.verdict.verdict,
          image_url: result.product.imageUrl,
        }),
      });
      setWatchAdded(true);
      setWatchlistRefresh(n => n + 1);
    } finally {
      setWatchLoading(false);
    }
  };

  const isLoading = loadingStep >= 0;

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(8,10,15,0.8)',
        backdropFilter: 'blur(16px)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/logo.png" alt="NexaBuy Logo" width={38} height={38} style={{ borderRadius: 8 }} />
            <div>
              <span style={{ fontSize: 18, fontWeight: 800, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                NexaBuy
              </span>
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>Purchase Copilot</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/cancel-return" className="btn btn-ghost btn-sm">↩️ Cancel / Return</Link>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setWatchlistOpen(true)}
              style={{ position: 'relative' }}
              suppressHydrationWarning
            >
              👀 Watchlist
            </button>
          </div>
        </div>
      </header>

      <main className="container" style={{ padding: '48px 20px 80px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="fade-up" style={{ marginBottom: 16 }}>
            <span className="badge badge-blue" style={{ marginBottom: 16 }}>AI-Powered Shopping</span>
          </div>
          <h1 className="fade-up" style={{ fontSize: 'clamp(28px,5vw,52px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 16 }}>
            Know if the price is{' '}
            <span style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              actually good
            </span>
          </h1>
          <p className="fade-up-1" style={{ fontSize: 17, color: '#64748b', maxWidth: 560, margin: '0 auto 36px' }}>
            Paste any product URL — get a live price comparison, trend signal, and nearby store availability in under 15 seconds.
          </p>

          {/* Input area */}
          <div className="card fade-up-2" style={{ maxWidth: 680, margin: '0 auto', padding: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  PRODUCT URL
                </label>
                <input
                  id="product-url-input"
                  className="input"
                  placeholder="https://www.amazon.com/dp/..."
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                  disabled={isLoading}
                  suppressHydrationWarning
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  YOUR LOCATION <span style={{ color: '#374151', fontWeight: 400 }}>(optional — for nearby stores)</span>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="location-input"
                    className="input"
                    placeholder="New York, NY"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    disabled={isLoading}
                    style={{ flex: 1 }}
                    suppressHydrationWarning
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '0 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    onClick={() => {
                      if ('geolocation' in navigator) {
                        navigator.geolocation.getCurrentPosition(
                          (pos) => setLocation(`${pos.coords.latitude}, ${pos.coords.longitude}`),
                          (err) => alert('Could not get location: ' + err.message)
                        );
                      } else {
                        alert('Geolocation is not supported');
                      }
                    }}
                    disabled={isLoading}
                    title="Get live location"
                    suppressHydrationWarning
                  >
                    📍
                  </button>
                </div>
              </div>
              <button
                id="analyze-btn"
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={isLoading || !url.trim()}
                style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 15 }}
              >
                {isLoading ? <><span className="spinner" /> Analyzing…</> : '🔍 Analyze this product'}
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="card" style={{ maxWidth: 680, margin: '0 auto 32px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}>
            <p style={{ color: '#ef4444', fontSize: 14 }}>⚠️ {error}</p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <LoadingSteps currentStep={loadingStep} />
          </div>
        )}

        {/* Results */}
        {result && !isLoading && (
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            {/* Watch CTA */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 20 }}>
              <button
                id="watch-price-btn"
                className={`btn ${watchAdded ? 'btn-ghost' : 'btn-primary'}`}
                onClick={handleWatch}
                disabled={watchLoading || watchAdded}
              >
                {watchLoading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Adding…</> : watchAdded ? '✓ Watching' : '👀 Watch this price'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <PriceCard product={result.product} comparisons={result.comparisons} verdict={result.verdict} />
              <TrendCard trend={result.trend} />

              {nearby && (
                <NearbyMap stores={nearby.stores} center={nearby.geo} productName={result.product.name} />
              )}
              {location && !nearby && (
                <div className="card fade-up-3" style={{ textAlign: 'center', color: '#475569', padding: 32 }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  <p>Loading nearby stores…</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <WatchlistDrawer
        isOpen={watchlistOpen}
        onClose={() => setWatchlistOpen(false)}
        refreshTrigger={watchlistRefresh}
      />
    </div>
  );
}
