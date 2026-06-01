import { DataSourceNote } from './StatusBadge';

interface StatCardProps {
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  valueClass?: string;
  dataSource?: string;
  mono?: boolean;
}

export function StatCard({ label, value, sub, valueClass, dataSource, mono = true }: StatCardProps) {
  const displayValue = value === null || value === undefined ? '—' : value;

  return (
    <div className="stat-card">
      <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {label}
        {dataSource && <DataSourceNote note={dataSource} />}
      </div>
      <div className={`value ${valueClass ?? ''}`} style={mono ? { fontFamily: 'JetBrains Mono, monospace' } : {}}>
        {displayValue}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

interface StatGridProps {
  children: React.ReactNode;
  cols?: number;
}

export function StatGrid({ children, cols = 5 }: StatGridProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: 12,
      marginBottom: 24,
    }}>
      {children}
    </div>
  );
}
