'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { StatusBadge, RateBadge, NumCell, DataSourceNote } from '@/components/ui/StatusBadge';
import { THRESHOLDS } from '@/lib/thresholds';

interface DomainRow {
  domain: string;
  client_name?: string;
  client_id?: number;
  status: string;
  inbox_count: number;
  active_inbox_count: number;
  disconnected_inbox_count: number;
  warmup_active_count: number;
  warmup_inactive_count: number;
  avg_warmup_reputation?: number | null;
  sent: number;
  replies: number;
  bounces: number;
  reply_rate: number;
  bounce_rate: number;
  recommended_action?: string;
}

interface Props {
  data: {
    domains: DomainRow[];
    clients: { client_id: number; client_name: string }[];
    lastSync: string | null;
    synced: boolean;
  };
}

export function DomainsTable({ data }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentClient = searchParams.get('client_id') ?? '';
  const currentStatus = searchParams.get('status') ?? '';

  if (!data.synced) {
    return (
      <div className="state-empty" style={{ marginTop: 40 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>No data yet</div>
        <div>Click <strong>Sync Now</strong> to fetch domain health data from Smartlead.</div>
      </div>
    );
  }

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const { domains, clients } = data;

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          className="filter-select"
          value={currentClient}
          onChange={e => updateFilter('client_id', e.target.value)}
        >
          <option value="">All Clients</option>
          {clients.map(c => (
            <option key={c.client_id} value={c.client_id}>{c.client_name}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={currentStatus}
          onChange={e => updateFilter('status', e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="Healthy">Healthy</option>
          <option value="Watch">Watch</option>
          <option value="Risk">Risk</option>
          <option value="Burned">Burned</option>
          <option value="Disconnected">Disconnected</option>
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <DataSourceNote note="Source: /analytics/mailbox/domain-wise-health-metrics (per client, last 7 days). Inbox counts from /email-accounts/." />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{domains.length} domains shown</span>
        </div>
      </div>

      {/* Status summary */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['Burned', 'Risk', 'Watch', 'Healthy', 'Disconnected'] as const).map(s => {
          const count = domains.filter(d => d.status === s).length;
          if (count === 0) return null;
          return (
            <button
              key={s}
              onClick={() => updateFilter('status', currentStatus === s ? '' : s)}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                border: `1px solid var(--bg-border)`, background: 'var(--bg-raised)',
                color: 'var(--text-secondary)', fontFamily: 'inherit',
              }}
            >
              <StatusBadge status={s} /> <span style={{ marginLeft: 4 }}>{count}</span>
            </button>
          );
        })}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Domain</th>
              {!currentClient && <th>Client</th>}
              <th>Status</th>
              <th>Inboxes</th>
              <th>Active</th>
              <th>Disc.</th>
              <th>Warmup ✓</th>
              <th>Warmup ✗</th>
              <th>Avg Rep.</th>
              <th>Sent 7d</th>
              <th>Replies</th>
              <th>Bounces</th>
              <th>Reply %</th>
              <th>Bounce %</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {domains.length === 0 ? (
              <tr>
                <td colSpan={15} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No domains match the current filter.
                </td>
              </tr>
            ) : domains.map(d => (
              <tr key={`${d.domain}-${d.client_id}`} className={
                d.status === 'Risk' || d.status === 'Burned' ? 'row-risk' :
                d.status === 'Watch' ? 'row-watch' : 'row-healthy'
              }>
                <td>
                  <Link
                    href={`/domains/${encodeURIComponent(d.domain)}`}
                    style={{ color: 'var(--text-primary)', textDecoration: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 500 }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-light)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                  >
                    {d.domain}
                  </Link>
                </td>
                {!currentClient && (
                  <td style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    {d.client_name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                )}
                <td><StatusBadge status={d.status} /></td>
                <td><NumCell value={d.inbox_count} /></td>
                <td><NumCell value={d.active_inbox_count} /></td>
                <td>
                  {d.disconnected_inbox_count > 0
                    ? <NumCell value={d.disconnected_inbox_count} className="num-watch" />
                    : <NumCell value={0} className="num-neutral" />}
                </td>
                <td><NumCell value={d.warmup_active_count} /></td>
                <td>
                  {d.warmup_inactive_count > 0
                    ? <NumCell value={d.warmup_inactive_count} className="num-watch" />
                    : <NumCell value={0} className="num-neutral" />}
                </td>
                <td>
                  {d.avg_warmup_reputation != null
                    ? <RateBadge value={d.avg_warmup_reputation} warningThreshold={THRESHOLDS.warmupReputationWarning} criticalThreshold={THRESHOLDS.warmupReputationCritical} lowerIsBetter={false} suffix="" digits={0} />
                    : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                </td>
                <td><NumCell value={d.sent} /></td>
                <td><NumCell value={d.replies} /></td>
                <td>
                  {d.bounces > 0
                    ? <NumCell value={d.bounces} className={d.bounce_rate > THRESHOLDS.bounceRateWarning ? 'num-risk' : 'num-neutral'} />
                    : <NumCell value={0} className="num-neutral" />}
                </td>
                <td><RateBadge value={d.reply_rate} warningThreshold={THRESHOLDS.replyRateWarning} lowerIsBetter={false} /></td>
                <td><RateBadge value={d.bounce_rate} warningThreshold={THRESHOLDS.bounceRateWarning} criticalThreshold={THRESHOLDS.bounceRateCritical} lowerIsBetter={true} /></td>
                <td style={{ maxWidth: 200, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  {d.recommended_action ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
