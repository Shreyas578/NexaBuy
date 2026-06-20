'use client';

import { useState, useEffect } from 'react';

interface WatchlistItem {
  id: number;
  url: string;
  product_name: string;
  price: number;
  currency: string;
  verdict: string;
  image_url?: string;
  last_checked_at: string;
  created_at: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  refreshTrigger?: number;
}

const VERDICT_COLOR: Record<string, string> = {
  'Good Deal': '#22c55e', 'Average': '#eab308', 'Wait': '#ef4444',
};

export default function WatchlistDrawer({ isOpen, onClose, refreshTrigger }: Props) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [recheckingId, setRecheckingId] = useState<number | null>(null);
  const [lastChange, setLastChange] = useState<{ id: number; diff: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/watchlist');
      const data = await res.json();
      if (data.error) setError(data.error);
      else setItems(data.items ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isOpen) fetchItems(); }, [isOpen, refreshTrigger]);

  const handleRecheck = async (id: number) => {
    setRecheckingId(id);
    setLastChange(null);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setLastChange({ id, diff: data.priceChange ?? 0 });
        fetchItems();
      }
    } finally {
      setRecheckingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    await fetch('/api/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchItems();
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99, backdropFilter: 'blur(2px)' }}
        />
      )}

      {/* Drawer */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 100,
        width: 380, maxWidth: '90vw',
        background: '#0d1117',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRight: 'none',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>👀 Watchlist</h3>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{items.length} item{items.length !== 1 ? 's' : ''} tracked</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕ Close</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {error && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#ef4444' }}>
              Error: {error}<br/>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>Make sure DATABASE_URL is set in your environment variables.</span>
            </div>
          )}
          {loading && <div className="spinner" style={{ margin: '20px auto', display: 'block' }} />}
          {!loading && items.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#475569' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <p>No items yet.</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>Click "Watch this price" on any product.</p>
            </div>
          )}
          {items.map(item => {
            const change = lastChange?.id === item.id ? lastChange.diff : null;
            return (
              <div key={item.id} style={{
                padding: 14, marginBottom: 10, borderRadius: 10,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  {item.image_url && (
                    <img src={item.image_url} alt="" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.product_name}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{item.currency}{Number(item.price).toFixed(2)}</span>
                      {change !== null && (
                        <span style={{ fontSize: 12, color: change < 0 ? '#22c55e' : change > 0 ? '#ef4444' : '#64748b' }}>
                          {change < 0 ? `▼ $${Math.abs(change).toFixed(2)}` : change > 0 ? `▲ $${change.toFixed(2)}` : 'No change'}
                        </span>
                      )}
                      {item.verdict && (
                        <span style={{ fontSize: 11, color: VERDICT_COLOR[item.verdict] ?? '#64748b' }}>● {item.verdict}</span>
                      )}
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>
                  Last checked: {item.last_checked_at ? new Date(item.last_checked_at).toLocaleString() : 'Never'}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleRecheck(item.id)}
                    disabled={recheckingId === item.id}
                    style={{ flex: 1 }}
                  >
                    {recheckingId === item.id ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Checking…</> : '🔄 Re-check now'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
