'use client';

import Link from 'next/link';
import { useState } from 'react';
import { StatusBadge, RateBadge, NumCell, DataSourceNote } from '@/components/ui/StatusBadge';
import { THRESHOLDS } from '@/lib/thresholds';

interface ClientRow {
  client_id: number;
  client_name: string;
  active_campaigns: number;
  active_domains: number;
  active_inboxes: number;
  sent_7d: number;
  replies_7d: number;
  positive_replies_7d: number | null;
  reply_rate: number;
  positive_reply_rate: number | null;
  bounce_rate: number;
  risk_domains: number;
  disconnected_inboxes: number;
  campaigns_needing_review: number;
  status: string;
}

interface Props {
  data: {
    clients: ClientRow[];
    lastSync: string | null;
    synced: boolean;
  };
}

export function OverviewClientTable({ data }: Props) {
  const [filter, setFilter] = useState<'all' | 'Risk' | 'Watch'>('all');

  if (!data.synced) {
    return (
      <div className="state-empty" style={{ marginTop: 40 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 8 }}>
          No data yet
        </div>
        <div>Click <strong>Sync Now</strong> in the top bar to fetch data from Smartlead.</div>
      </div>
    );
  }

  if (data.clients.length === 0) {
    return (
      <div className="state-empty">
        <div>No clients found. Make sure your SMARTLEAD_API_KEY is correct and sync has been run.</div>
      </div>
    );
  }

  const filtered = filter === 'all'
    ? data.clients
    : data.clients.filter(c => c.status === filter);

  const sortedClients = [...filtered].sort((a, b) => {
    const order = { Risk: 0, Watch: 1, Healthy: 2 };
    return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
  });

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Filter:
        </span>
        {(['all', 'Risk', 'Watch'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: '1px solid ' + (filter === f ? 'var(--accent)' : 'var(--bg-border)'),
              background: filter === f ? 'rgba(37,99,235,0.15)' : 'var(--bg-raised)',
              color: filter === f ? 'var(--accent-light)' : 'var(--text-secondary)',
              transition: 'all 0.1s',
            }}
          >
            {f === 'all' ? `All (${data.clients.length})` : f}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <DataSourceNote note="Metrics from /analytics/campaign/overall-stats + /analytics/campaign/response-stats, date range = last 7 days" />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Data sources</span>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Status</th>
              <th>Campaigns</th>
              <th>Domains</th>
              <th>Inboxes</th>
              <th>Sent 7d</th>
              <th>Replies 7d</th>
              {data.clients.some(c => c.positive_replies_7d !== null) && (
                <th>Pos. Replies</th>
              )}
              <th>Reply %</th>
              {data.clients.some(c => c.positive_reply_rate !== null) && (
                <th>Pos. Reply %</th>
              )}
              <th>Bounce %</th>
              <th>Risk Domains</th>
              <th>Disconnected</th>
              <th>Needs Review</th>
            </tr>
          </thead>
          <tbody>
            {sortedClients.map(client => {
              const rowClass =
                client.status === 'Risk' ? 'row-risk' :
                client.status === 'Watch' ? 'row-watch' : 'row-healthy';

              return (
                <tr key={client.client_id} className={rowClass}>
                  <td>
                    <Link
                      href={`/clients/${client.client_id}`}
                      style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-light)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                    >
                      {client.client_name}
                    </Link>
                  </td>
                  <td><StatusBadge status={client.status} /></td>
                  <td><NumCell value={client.active_campaigns} /></td>
                  <td><NumCell value={client.active_domains} /></td>
                  <td><NumCell value={client.active_inboxes} /></td>
                  <td><NumCell value={client.sent_7d} /></td>
                  <td><NumCell value={client.replies_7d} /></td>
                  {data.clients.some(c => c.positive_replies_7d !== null) && (
                    <td>
                      {client.positive_replies_7d !== null
                        ? <NumCell value={client.positive_replies_7d} className="num-healthy" />
                        : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>N/A</span>}
                    </td>
                  )}
                  <td>
                    <RateBadge
                      value={client.reply_rate}
                      warningThreshold={THRESHOLDS.replyRateWarning}
                      lowerIsBetter={false}
                    />
                  </td>
                  {data.clients.some(c => c.positive_reply_rate !== null) && (
                    <td>
                      {client.positive_reply_rate !== null
                        ? <RateBadge value={client.positive_reply_rate} warningThreshold={THRESHOLDS.positiveReplyRateWarning} lowerIsBetter={false} />
                        : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>N/A</span>}
                    </td>
                  )}
                  <td>
                    <RateBadge
                      value={client.bounce_rate}
                      warningThreshold={THRESHOLDS.bounceRateWarning}
                      criticalThreshold={THRESHOLDS.bounceRateCritical}
                      lowerIsBetter={true}
                    />
                  </td>
                  <td>
                    {client.risk_domains > 0
                      ? <span className="font-mono num-risk" style={{ fontSize: 12.5 }}>{client.risk_domains}</span>
                      : <span className="font-mono num-neutral" style={{ fontSize: 12.5 }}>0</span>}
                  </td>
                  <td>
                    {client.disconnected_inboxes > 0
                      ? <span className="font-mono num-watch" style={{ fontSize: 12.5 }}>{client.disconnected_inboxes}</span>
                      : <span className="font-mono num-neutral" style={{ fontSize: 12.5 }}>0</span>}
                  </td>
                  <td>
                    {client.campaigns_needing_review > 0
                      ? <span className="font-mono num-risk" style={{ fontSize: 12.5 }}>{client.campaigns_needing_review}</span>
                      : <span className="font-mono num-neutral" style={{ fontSize: 12.5 }}>0</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sortedClients.length === 0 && (
        <div className="state-empty" style={{ padding: '40px 0' }}>
          No clients match the current filter.
        </div>
      )}
    </div>
  );
}
