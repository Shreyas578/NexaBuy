'use client';

const STEPS = [
  { id: 'scrape', label: 'Scraping product page', icon: '🔍' },
  { id: 'compare', label: 'Comparing prices', icon: '💰' },
  { id: 'trends', label: 'Analyzing trends', icon: '📈' },
  { id: 'verdict', label: 'Generating verdict', icon: '🤖' },
];

interface Props {
  currentStep: number; // 0-3, -1 = done
}

export default function LoadingSteps({ currentStep }: Props) {
  return (
    <div style={{ padding: '32px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STEPS.map((step, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div
              key={step.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px',
                background: active ? 'rgba(59,130,246,0.08)' : done ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${active ? 'rgba(59,130,246,0.3)' : done ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 10,
                transition: 'all 0.3s',
                opacity: i > currentStep ? 0.4 : 1,
              }}
            >
              <span style={{ fontSize: 20 }}>{step.icon}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: active ? '#f1f5f9' : '#94a3b8' }}>
                {step.label}
              </span>
              {done && <span style={{ color: '#22c55e', fontSize: 16 }}>✓</span>}
              {active && <span className="spinner" />}
            </div>
          );
        })}
      </div>
      <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#64748b' }}>
        This takes 10–15 seconds — hang tight!
      </p>
    </div>
  );
}
