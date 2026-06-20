'use client';

import { useState } from 'react';

interface Props {
  steps: string[];
  email: string;
  retailer: string;
  timeframe: string;
  intent: 'cancel' | 'return';
  policyUrl: string;
}

export default function ReturnChecklist({ steps, email, retailer, timeframe, intent, policyUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{intent === 'cancel' ? '🚫' : '↩️'}</span>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>{intent === 'cancel' ? 'Cancellation' : 'Return'} Guide — {retailer}</h2>
            {timeframe && (
              <span className="badge badge-yellow" style={{ marginTop: 4 }}>
                ⏱ {timeframe} window
              </span>
            )}
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Source: <a href={policyUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>Official {retailer} Policy</a>
        </p>
      </div>

      {/* Steps */}
      <div className="card">
        <p className="section-label">Step-by-step instructions</p>
        <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((step, i) => (
            <li key={i} style={{
              display: 'flex', gap: 12, padding: '12px 14px',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10, fontSize: 14, lineHeight: 1.5,
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#fff',
              }}>{i + 1}</span>
              <span style={{ color: '#cbd5e1' }}>{step.replace(/^Step\s*\d+[:.]?\s*/i, '')}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Email Draft */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p className="section-label" style={{ marginBottom: 0 }}>✉️ Draft {intent} email</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowEmail(!showEmail)}>
              {showEmail ? 'Hide' : 'Show'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleCopy}>
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        </div>
        {showEmail && (
          <pre style={{
            fontSize: 13, color: '#94a3b8', lineHeight: 1.6,
            background: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 8,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {email}
          </pre>
        )}
        {!showEmail && (
          <p style={{ fontSize: 13, color: '#475569' }}>Click "Show" to preview the draft email, then copy it to your clipboard.</p>
        )}
      </div>
    </div>
  );
}
