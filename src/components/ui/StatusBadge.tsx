import type { CampaignStatusLabel, DomainStatus, ClientStatus } from '@/lib/thresholds';

type Status = CampaignStatusLabel | DomainStatus | ClientStatus | string;

const STATUS_CLASS: Record<string, string> = {
  // Client/Domain statuses
  Healthy: 'badge-healthy',
  Watch: 'badge-watch',
  Risk: 'badge-risk',
  Burned: 'badge-burned',
  Disconnected: 'badge-disconnected',
  // Campaign statuses (API)
  ACTIVE: 'badge-active',
  PAUSED: 'badge-paused',
  STOPPED: 'badge-stopped',
  DRAFTED: 'badge-drafted',
  COMPLETED: 'badge-completed',
  // Campaign status labels
  Winning: 'badge-winning',
  'Insufficient Data': 'badge-insufficient',
  'Copy/List Issue': 'badge-copy-issue',
  'Deliverability Risk': 'badge-deliverability',
  'Pause Review': 'badge-pause',
  // Severity
  Critical: 'badge-critical',
  High: 'badge-high',
  Medium: 'badge-medium',
  Low: 'badge-low',
};

const DOTS: Record<string, string> = {
  Healthy: '●', ACTIVE: '●',
  Watch: '◐', PAUSED: '◐',
  Risk: '●', STOPPED: '●', Burned: '●',
  Disconnected: '●',
  Critical: '●', High: '●', Medium: '●',
};

export function StatusBadge({ status }: { status: Status }) {
  const cls = STATUS_CLASS[status] ?? 'badge-drafted';
  const dot = DOTS[status];
  return (
    <span className={`badge ${cls}`}>
      {dot && <span style={{ fontSize: 8 }}>{dot}</span>}
      {status}
    </span>
  );
}

export function RateBadge({
  value,
  warningThreshold,
  criticalThreshold,
  lowerIsBetter = false,
  suffix = '%',
  digits = 1,
}: {
  value: number | null | undefined;
  warningThreshold: number;
  criticalThreshold?: number;
  lowerIsBetter?: boolean;
  suffix?: string;
  digits?: number;
}) {
  if (value === null || value === undefined) {
    return <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>—</span>;
  }

  let cls = 'num-neutral';
  if (lowerIsBetter) {
    if (criticalThreshold !== undefined && value > criticalThreshold) cls = 'num-risk';
    else if (value > warningThreshold) cls = 'num-watch';
    else cls = 'num-healthy';
  } else {
    if (criticalThreshold !== undefined && value < criticalThreshold) cls = 'num-risk';
    else if (value < warningThreshold) cls = 'num-watch';
    else cls = 'num-healthy';
  }

  return (
    <span className={`font-mono ${cls}`} style={{ fontSize: 12.5 }}>
      {value.toFixed(digits)}{suffix}
    </span>
  );
}

export function NumCell({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined) {
    return <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>—</span>;
  }
  return (
    <span className={`font-mono ${className ?? ''}`} style={{ fontSize: 12.5 }}>
      {value.toLocaleString()}
    </span>
  );
}

export function DataSourceNote({ note }: { note: string }) {
  return (
    <div className="tooltip-wrap" style={{ display: 'inline-flex' }}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-muted)', cursor: 'help' }}>
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 7v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="8" cy="4.5" r="0.75" fill="currentColor"/>
      </svg>
      <div className="tooltip-box">{note}</div>
    </div>
  );
}
