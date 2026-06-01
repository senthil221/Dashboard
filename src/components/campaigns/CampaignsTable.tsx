'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { StatusBadge, RateBadge, NumCell, DataSourceNote } from '@/components/ui/StatusBadge';
import { THRESHOLDS } from '@/lib/thresholds';

interface CampaignRow {
  campaign_id: number;
  campaign_name: string;
  campaign_status: string;
  client_id?: number;
  client_name?: string;
  sent_7d?: number;
  replies_7d?: number;
  positive_replies?: number | null;
  bounces?: number;
  reply_rate?: number;
  positive_reply_rate?: number | null;
  bounce_rate?: number;
  status_label?: string;
  recommended_action?: string;
}

interface Props {
  data: {
    campaigns: CampaignRow[];
    clients: { client_id: number; client_name: string }[];
    lastSync: string | null;
    synced: boolean;
  };
}

export function CampaignsTable({ data }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentClient = searchParams.get('client_id') ?? '';
  const currentStatus = searchParams.get('status') ?? '';

  const hasPositive = data.campaigns.some(c => c.positive_replies != null);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  if (!data.synced) {
    return (
      <div className="state-empty" style={{ marginTop: 40 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>No data yet</div>
        <div>Click <strong>Sync Now</strong> to fetch campaign performance data.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="filter-select" value={currentClient} onChange={e => updateFilter('client_id', e.target.value)}>
          <option value="">All Clients</option>
          {data.clients.map(c => <option key={c.client_id} value={c.client_id}>{c.client_name}</option>)}
        </select>

        <select className="filter-select" value={currentStatus} onChange={e => updateFilter('status', e.target.value)}>
          <option value="">All Campaign Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="STOPPED">Stopped</option>
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <DataSourceNote note="Source: /analytics/campaign/overall-stats + /analytics/campaign/response-stats (last 7 days). Status labels calculated per thresholds.ts." />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{data.campaigns.length} campaigns</span>
        </div>
      </div>

      {/* Status label summary */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {['Winning', 'Healthy', 'Watch', 'Copy/List Issue', 'Deliverability Risk', 'Pause Review'].map(label => {
          const count = data.campaigns.filter(c => c.status_label === label).length;
          if (count === 0) return null;
          return (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }}>
              <StatusBadge status={label} />
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{count}</span>
            </span>
          );
        })}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Campaign</th>
              {!currentClient && <th>Client</th>}
              <th>Status</th>
              <th>Label</th>
              <th>Sent 7d</th>
              <th>Replies</th>
              {hasPositive && <th>Pos. Replies</th>}
              <th>Reply %</th>
              {hasPositive && <th>Pos. Reply %</th>}
              <th>Bounces</th>
              <th>Bounce %</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.length === 0 ? (
              <tr><td colSpan={12} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No campaigns found.</td></tr>
            ) : data.campaigns.map(c => {
              const rowCls = c.status_label === 'Pause Review' || c.status_label === 'Deliverability Risk'
                ? 'row-risk'
                : c.status_label === 'Watch' || c.status_label === 'Copy/List Issue'
                ? 'row-watch'
                : 'row-healthy';

              return (
                <tr key={c.campaign_id} className={rowCls}>
                  <td style={{ maxWidth: 240 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.campaign_name}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      #{c.campaign_id}
                    </div>
                  </td>
                  {!currentClient && (
                    <td style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                      {c.client_name ?? '—'}
                    </td>
                  )}
                  <td><StatusBadge status={c.campaign_status} /></td>
                  <td>{c.status_label ? <StatusBadge status={c.status_label} /> : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}</td>
                  <td><NumCell value={c.sent_7d} /></td>
                  <td><NumCell value={c.replies_7d} /></td>
                  {hasPositive && (
                    <td>{c.positive_replies != null
                      ? <NumCell value={c.positive_replies} className="num-healthy" />
                      : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                    </td>
                  )}
                  <td><RateBadge value={c.reply_rate} warningThreshold={THRESHOLDS.replyRateWarning} lowerIsBetter={false} /></td>
                  {hasPositive && (
                    <td>{c.positive_reply_rate != null
                      ? <RateBadge value={c.positive_reply_rate} warningThreshold={THRESHOLDS.positiveReplyRateWarning} lowerIsBetter={false} />
                      : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                    </td>
                  )}
                  <td>
                    {(c.bounces ?? 0) > 0
                      ? <NumCell value={c.bounces} className={c.bounce_rate != null && c.bounce_rate > THRESHOLDS.bounceRateWarning ? 'num-risk' : 'num-neutral'} />
                      : <NumCell value={0} className="num-neutral" />}
                  </td>
                  <td><RateBadge value={c.bounce_rate} warningThreshold={THRESHOLDS.bounceRateWarning} criticalThreshold={THRESHOLDS.bounceRateCritical} lowerIsBetter={true} /></td>
                  <td style={{ maxWidth: 220, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    {c.recommended_action ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
