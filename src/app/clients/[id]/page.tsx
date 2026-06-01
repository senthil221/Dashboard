import { Topbar } from '@/components/layout/Topbar';
import { StatCard, StatGrid } from '@/components/ui/StatCards';
import { StatusBadge, RateBadge, NumCell, DataSourceNote } from '@/components/ui/StatusBadge';
import Link from 'next/link';
import { THRESHOLDS } from '@/lib/thresholds';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function getClientDetail(id: string) {
  try {
    const { getDb } = await import('@/lib/db');
    const { getClientStatus } = await import('@/lib/thresholds');
    const db = getDb();
    const clientId = parseInt(id, 10);
    if (isNaN(clientId)) return null;

    const dateToday = new Date().toISOString().split('T')[0];
    const client = db.prepare(`SELECT * FROM clients_snapshot WHERE client_id = ?`).get(clientId) as any;
    if (!client) return null;

    const metrics = db.prepare(
      `SELECT SUM(sent) as sent_7d, SUM(replies) as replies_7d,
              SUM(COALESCE(positive_replies,0)) as positive_replies_7d, SUM(bounces) as bounces_7d,
              CASE WHEN SUM(sent)>0 THEN (SUM(replies)*100.0/SUM(sent)) ELSE 0 END as reply_rate,
              CASE WHEN SUM(sent)>0 THEN (SUM(bounces)*100.0/SUM(sent)) ELSE 0 END as bounce_rate,
              SUM(CASE WHEN positive_replies IS NOT NULL THEN 1 ELSE 0 END) as has_positive_data
       FROM campaigns_daily WHERE client_id=? AND date=?`
    ).get(clientId, dateToday) as any;

    const inboxes = db.prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN smtp_status=1 AND imap_status=1 THEN 1 ELSE 0 END) as active,
              SUM(CASE WHEN smtp_status=0 OR imap_status=0 THEN 1 ELSE 0 END) as disconnected
       FROM inboxes_snapshot WHERE client_id=?`
    ).get(clientId) as any;

    const domainCount = db.prepare(
      `SELECT COUNT(DISTINCT domain) as total FROM inboxes_snapshot WHERE client_id=?`
    ).get(clientId) as any;

    const riskDomains = db.prepare(
      `SELECT COUNT(*) as count FROM domains_daily WHERE client_id=? AND date=? AND status IN ('Risk','Burned')`
    ).get(clientId, dateToday) as any;

    const campaigns = db.prepare(
      `SELECT cs.campaign_id, cs.campaign_name, cs.status,
              cd.sent as sent_7d, cd.replies as replies_7d, cd.positive_replies,
              cd.reply_rate, cd.positive_reply_rate, cd.bounce_rate, cd.bounces,
              cd.status_label, cd.recommended_action
       FROM campaigns_snapshot cs
       LEFT JOIN campaigns_daily cd ON cs.campaign_id=cd.campaign_id AND cd.date=?
       WHERE cs.client_id=?
       ORDER BY COALESCE(cd.sent,0) DESC, cs.campaign_name`
    ).all(dateToday, clientId) as any[];

    const domains = db.prepare(
      `SELECT dd.*,
              ins.inbox_count, ins.active_count, ins.disc_count, ins.warmup_active, ins.warmup_inactive
       FROM domains_daily dd
       LEFT JOIN (
         SELECT domain,
           COUNT(*) as inbox_count,
           SUM(CASE WHEN smtp_status=1 AND imap_status=1 THEN 1 ELSE 0 END) as active_count,
           SUM(CASE WHEN smtp_status=0 OR imap_status=0 THEN 1 ELSE 0 END) as disc_count,
           SUM(warmup_status) as warmup_active,
           SUM(CASE WHEN warmup_status=0 THEN 1 ELSE 0 END) as warmup_inactive
         FROM inboxes_snapshot WHERE client_id=?
         GROUP BY domain
       ) ins ON dd.domain=ins.domain
       WHERE dd.date=? AND dd.client_id=?
       ORDER BY dd.bounce_rate DESC, dd.sent DESC`
    ).all(clientId, dateToday, clientId) as any[];

    const riskCount = riskDomains?.count ?? 0;
    const disc = inboxes?.disconnected ?? 0;
    const bounceRate = metrics?.bounce_rate ?? 0;

    return {
      client: { ...client, status: getClientStatus(riskCount, disc, bounceRate) },
      metrics: {
        sent_7d: metrics?.sent_7d ?? 0,
        replies_7d: metrics?.replies_7d ?? 0,
        positive_replies_7d: (metrics?.has_positive_data ?? 0) > 0 ? metrics?.positive_replies_7d : null,
        reply_rate: metrics?.reply_rate ?? 0,
        bounce_rate: bounceRate,
        active_campaigns: campaigns.filter((c: any) => c.status === 'ACTIVE').length,
        total_campaigns: campaigns.length,
        active_domains: domainCount?.total ?? 0,
        risk_domains: riskCount,
        active_inboxes: inboxes?.active ?? 0,
        disconnected_inboxes: disc,
      },
      campaigns,
      domains,
    };
  } catch {
    return null;
  }
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getClientDetail(id);

  if (!data) return notFound();

  const { client, metrics, campaigns, domains } = data;
  const hasPositive = metrics.positive_replies_7d !== null;

  return (
    <>
      <Topbar
        title={client.client_name}
        subtitle={`Client ID ${client.client_id} · ${client.email}`}
      />
      <div className="page-body">
        {/* Breadcrumb */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, display: 'flex', gap: 8 }}>
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Overview</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-secondary)' }}>{client.client_name}</span>
        </div>

        {/* Status + top metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <StatusBadge status={client.status} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {metrics.active_campaigns} active campaign{metrics.active_campaigns !== 1 ? 's' : ''} ·{' '}
            {metrics.active_domains} domain{metrics.active_domains !== 1 ? 's' : ''} ·{' '}
            {metrics.active_inboxes} inboxes
          </span>
        </div>

        <StatGrid cols={hasPositive ? 6 : 5}>
          <StatCard label="Sent (7d)" value={metrics.sent_7d?.toLocaleString()}
            dataSource="Source: /analytics/campaign/overall-stats (last 7 days)" />
          <StatCard label="Replies (7d)" value={metrics.replies_7d?.toLocaleString()} />
          {hasPositive && (
            <StatCard label="Pos. Replies (7d)" value={metrics.positive_replies_7d?.toString()}
              valueClass="num-healthy"
              dataSource="Source: /analytics/campaign/response-stats (interested_count)" />
          )}
          <StatCard label="Reply Rate" value={`${(metrics.reply_rate ?? 0).toFixed(1)}%`}
            valueClass={metrics.reply_rate < THRESHOLDS.replyRateWarning ? 'num-watch' : 'num-healthy'} />
          <StatCard label="Bounce Rate" value={`${(metrics.bounce_rate ?? 0).toFixed(2)}%`}
            valueClass={metrics.bounce_rate > THRESHOLDS.bounceRateCritical ? 'num-risk' : metrics.bounce_rate > THRESHOLDS.bounceRateWarning ? 'num-watch' : ''} />
          {metrics.risk_domains > 0 && (
            <StatCard label="Risk Domains" value={metrics.risk_domains} valueClass="num-risk" />
          )}
          {metrics.disconnected_inboxes > 0 && (
            <StatCard label="Disconnected" value={metrics.disconnected_inboxes} valueClass="num-watch" />
          )}
        </StatGrid>

        {/* Campaigns Table */}
        <div style={{ marginBottom: 32 }}>
          <div className="section-header">
            <div className="section-title">Campaigns</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <DataSourceNote note="Source: /analytics/campaign/overall-stats + /analytics/campaign/response-stats" />
              Last 7 days
            </div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Label</th>
                  <th>Sent 7d</th>
                  <th>Replies</th>
                  {hasPositive && <th>Pos. Replies</th>}
                  <th>Reply %</th>
                  {hasPositive && <th>Pos. Reply %</th>}
                  <th>Bounce %</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr><td colSpan={12} className="state-empty" style={{ padding: '30px', textAlign: 'center' }}>No campaigns</td></tr>
                ) : campaigns.map((c: any) => (
                  <tr key={c.campaign_id} className={
                    c.status_label === 'Pause Review' ? 'row-risk' :
                    c.status_label === 'Deliverability Risk' ? 'row-risk' :
                    c.status_label === 'Watch' ? 'row-watch' : 'row-healthy'
                  }>
                    <td style={{ maxWidth: 220 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.campaign_name}
                      </div>
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>{c.status_label ? <StatusBadge status={c.status_label} /> : <span className="badge badge-insufficient">—</span>}</td>
                    <td><NumCell value={c.sent_7d} /></td>
                    <td><NumCell value={c.replies_7d} /></td>
                    {hasPositive && <td>{c.positive_replies !== null ? <NumCell value={c.positive_replies} className="num-healthy" /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>}
                    <td><RateBadge value={c.reply_rate} warningThreshold={THRESHOLDS.replyRateWarning} lowerIsBetter={false} /></td>
                    {hasPositive && <td>{c.positive_reply_rate != null ? <RateBadge value={c.positive_reply_rate} warningThreshold={THRESHOLDS.positiveReplyRateWarning} lowerIsBetter={false} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>}
                    <td><RateBadge value={c.bounce_rate} warningThreshold={THRESHOLDS.bounceRateWarning} criticalThreshold={THRESHOLDS.bounceRateCritical} lowerIsBetter={true} /></td>
                    <td style={{ maxWidth: 200, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                      {c.recommended_action ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Domains Table */}
        <div>
          <div className="section-header">
            <div className="section-title">Domains</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <DataSourceNote note="Source: /analytics/mailbox/domain-wise-health-metrics + /email-accounts/ (for inbox counts)" />
              Last 7 days
            </div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Status</th>
                  <th>Inboxes</th>
                  <th>Active</th>
                  <th>Disconnected</th>
                  <th>Warmup On</th>
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
                  <tr><td colSpan={12} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No domain data. Sync required.</td></tr>
                ) : domains.map((d: any) => (
                  <tr key={d.domain} className={
                    d.status === 'Risk' || d.status === 'Burned' ? 'row-risk' :
                    d.status === 'Watch' ? 'row-watch' : 'row-healthy'
                  }>
                    <td>
                      <Link
                        href={`/domains/${encodeURIComponent(d.domain)}`}
                        style={{ color: 'var(--text-primary)', textDecoration: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, fontWeight: 500 }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-light)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                      >
                        {d.domain}
                      </Link>
                    </td>
                    <td><StatusBadge status={d.status} /></td>
                    <td><NumCell value={d.inbox_count} /></td>
                    <td><NumCell value={d.active_count} /></td>
                    <td>{d.disc_count > 0 ? <NumCell value={d.disc_count} className="num-watch" /> : <NumCell value={0} className="num-neutral" />}</td>
                    <td><NumCell value={d.warmup_active} /></td>
                    <td><NumCell value={d.sent} /></td>
                    <td><NumCell value={d.replies} /></td>
                    <td><NumCell value={d.bounces} /></td>
                    <td><RateBadge value={d.reply_rate} warningThreshold={THRESHOLDS.replyRateWarning} lowerIsBetter={false} /></td>
                    <td><RateBadge value={d.bounce_rate} warningThreshold={THRESHOLDS.bounceRateWarning} criticalThreshold={THRESHOLDS.bounceRateCritical} lowerIsBetter={true} /></td>
                    <td style={{ maxWidth: 180, fontSize: 11.5, color: 'var(--text-secondary)' }}>{d.recommended_action ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
