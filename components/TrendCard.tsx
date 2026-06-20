'use client';

import type { TrendSignalResult, TrendTimelinePoint } from '@/lib/trends';

interface Props {
  trend: TrendSignalResult;
}

const DIR_COLOR = { Rising: '#22c55e', Flat: '#eab308', Falling: '#ef4444' };
const DIR_BG = { Rising: 'rgba(34,197,94,0.1)', Flat: 'rgba(234,179,8,0.1)', Falling: 'rgba(239,68,68,0.1)' };

function Sparkline({ timelineData, direction }: { timelineData: TrendTimelinePoint[]; direction: string }) {
  const pts =
    timelineData.length >= 2
      ? timelineData.map(p => p.value)
      : fallbackSparkline(direction);

  const max = Math.max(...pts), min = Math.min(...pts);
  const range = max - min || 1;
  const W = 180, H = 48;
  const coords = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / range) * H}`);
  const path = `M${coords.join(' L')}`;
  const fill = `M${coords[0]} L${coords.join(' L')} L${W},${H} L0,${H} Z`;
  const color = DIR_COLOR[direction as keyof typeof DIR_COLOR] ?? '#3b82f6';

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${direction}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${direction})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx={coords[coords.length - 1].split(',')[0]} cy={coords[coords.length - 1].split(',')[1]} r="4" fill={color} />
    </svg>
  );
}

function fallbackSparkline(direction: string): number[] {
  const base = [45, 48, 44, 52, 49, 51, 47, 53];
  if (direction === 'Rising') return base.map((v, i) => v + i * 4);
  if (direction === 'Falling') return base.map((v, i) => v - i * 3.5);
  return base;
}

function sourceLabel(source: 'product' | 'category', keyword: string): string {
  return source === 'product'
    ? `This product: "${keyword}"`
    : `Category: "${keyword}"`;
}

function TrendBlock({
  label,
  direction,
  directionIcon,
  summary,
  timelineData,
  buySignal,
  muted,
}: {
  label: string;
  direction: 'Rising' | 'Flat' | 'Falling';
  directionIcon: '↗' | '→' | '↘';
  summary: string;
  timelineData: TrendTimelinePoint[];
  buySignal?: string;
  muted?: boolean;
}) {
  return (
    <div style={{ opacity: muted ? 0.85 : 1 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 12 }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '12px 16px', borderRadius: 12,
          background: DIR_BG[direction] ?? 'rgba(255,255,255,0.05)',
          border: `1.5px solid ${DIR_COLOR[direction] ?? '#64748b'}40`,
          minWidth: 90,
        }}>
          <span style={{ fontSize: 24 }}>{directionIcon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: DIR_COLOR[direction], marginTop: 4 }}>
            {direction}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <Sparkline timelineData={timelineData} direction={direction} />
        </div>
      </div>
      <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: buySignal ? 12 : 0 }}>
        {summary}
      </p>
      {buySignal && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
          fontSize: 14, color: '#93c5fd', fontWeight: 500,
        }}>
          💡 {buySignal}
        </div>
      )}
    </div>
  );
}

export default function TrendCard({ trend }: Props) {
  if (trend.status === 'unavailable') {
    return (
      <div className="card fade-up-1">
        <p className="section-label">📈 Trend Signal</p>
        <div style={{
          padding: '20px 16px', borderRadius: 10,
          background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)',
          color: '#94a3b8', fontSize: 14, lineHeight: 1.6,
        }}>
          {trend.unavailableMessage ?? 'Trend data unavailable for this product'}
        </div>
      </div>
    );
  }

  const { primary, secondary, fallbackNotice, risingQueries } = trend;
  if (!primary) return null;

  return (
    <div className="card fade-up-1">
      <p className="section-label">📈 Trend Signal</p>

      {fallbackNotice && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
          fontSize: 13, color: '#fcd34d', lineHeight: 1.5,
        }}>
          ℹ️ {fallbackNotice}
        </div>
      )}

      <TrendBlock
        label={sourceLabel(primary.source, primary.keyword)}
        direction={primary.direction}
        directionIcon={primary.directionIcon}
        summary={primary.summary}
        timelineData={primary.timelineData}
        buySignal={primary.buySignal}
      />

      {secondary && (
        <div style={{
          marginTop: 20, paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <TrendBlock
            label={sourceLabel(secondary.source, secondary.keyword)}
            direction={secondary.direction}
            directionIcon={secondary.directionIcon}
            summary={secondary.summary}
            timelineData={secondary.timelineData}
            muted
          />
        </div>
      )}

      {risingQueries.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            People are also searching for:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {risingQueries.map(q => (
              <span key={q} style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 20,
                background: 'rgba(255,255,255,0.05)', color: '#cbd5e1',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {q}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
