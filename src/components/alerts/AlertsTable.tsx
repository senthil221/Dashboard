'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';

interface AlertRow {
  id: number;
  client_id?: number;
  client_name?: string;
  object_type: string;
  object_id?: string;
  object_name: string;
  alert_type: string;
  severity: string;
  issue: string;
  recommended_action?: string;
  status: string;
  first_detected_at: string;
  last_updated_at: string;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  domain_high_bounce_rate: 'High Bounce Rate',
  domain_no_replies: 'No Replies',
  inbox_disconnected: 'Inbox Disconnected',
  warmup_inactive: 'Warmup Inactive',
  warmup_reputation_low: 'Warmup Rep. Low',
  campaign_active_not_sending: 'Not Sending',
  campaign_high_bounce_rate: 'Campaign High Bounce',
  campaign_no_replies: 'No Replies',
  client_high_bounce_rate: 'Client High Bounce',
  client_no_active_campaign: 'No Active Campaign',
};

interface Props {
  data: {
    alerts: AlertRow[];
    counts: { severity: string; count: number }[];
    clients: { client_id: number; client_name: string }[];
    lastSync: string | null;
    synced: boolean;
  };
}

export function AlertsTable({ data }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentClient = searchParams.get('client_id') ?? '';
  const currentSeverity = searchParams.get('severity') ?? '';
  const [resolving, setResolving] = useState<Set<number>>(new Set());

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  async function resolveAlert(id: number) {
    setResolving(prev => new Set([...prev, id]));
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'resolved' }),
      });
      router.refresh();
    } finally {
      setResolving(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  const { alerts, counts, clients } = data;

  return (
    <div>
      {/* Severity summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => {
          const count = counts.find(c => c.severity === sev)?.count ?? 0;
          return (
            <button
              key={sev}
              onClick={() => updateFilter('severity', currentSeverity === sev ? '' : sev)}
              style={{
                padding: '4px 12px', borderRadius: 5, fontSize: 12.5, cursor: 'pointer',
                border: `1px solid ${currentSeverity === sev ? 'var(--accent)' : 'var(--bg-border)'}`,
                background: currentSeverity === sev ? 'rgba(37,99,235,0.1)' : 'var(--bg-raised)',
                color: 'var(--text-secondary)', fontFamily: 'inherit',
              }}
            >
              <StatusBadge status={sev} /> <span style={{ marginLeft: 5, fontFamily: 'JetBrains Mono, monospace' }}>{count}</span>
            </button>
          );
        })}

        <select className="filter-select" value={currentClient} onChange={e => updateFilter('client_id', e.target.value)}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.client_name}</option>)}
        </select>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          {alerts.length} active alert{alerts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
          borderRadius: 8, padding: '40px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--status-healthy)', marginBottom: 6 }}>
            All clear
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No active alerts matching the current filter.
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Type</th>
                <th>Object</th>
                <th>Client</th>
                <th>Issue</th>
                <th>Recommended Action</th>
                <th>First Seen</th>
                <th>Last Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(alert => (
                <tr key={alert.id} className={
                  alert.severity === 'Critical' ? 'row-risk' :
                  alert.severity === 'High' ? 'row-risk' :
                  alert.severity === 'Medium' ? 'row-watch' : 'row-healthy'
                }>
                  <td><StatusBadge status={alert.severity} /></td>
                  <td>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                      {ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {alert.object_type}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12.5, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>
                      {alert.object_name}
                    </div>
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    {alert.client_name ?? '—'}
                  </td>
                  <td style={{ maxWidth: 260, fontSize: 12.5 }}>
                    {alert.issue}
                  </td>
                  <td style={{ maxWidth: 220, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {alert.recommended_action ?? '—'}
                  </td>
                  <td style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDate(alert.first_detected_at)}
                  </td>
                  <td style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDate(alert.last_updated_at)}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => resolveAlert(alert.id)}
                      disabled={resolving.has(alert.id)}
                    >
                      {resolving.has(alert.id) ? '…' : 'Resolve'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return format(new Date(iso), 'MMM d, h:mm a');
  } catch {
    return iso;
  }
}
