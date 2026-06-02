'use client';

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <div className="topbar">
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>

      <div className="sync-bar">
        <div className="pulse-dot" />
        <span>Live data</span>
      </div>

      <button
        className="btn btn-secondary"
        onClick={() => window.location.reload()}
        style={{ fontSize: 12, padding: '5px 12px' }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M2 8a6 6 0 1 1 1.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M2 4.5V8h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Refresh
      </button>
    </div>
  );
}
