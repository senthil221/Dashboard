import { Topbar } from '@/components/layout/Topbar';
import { StatCard, StatGrid } from '@/components/ui/StatCards';
import { StatusBadge, RateBadge, NumCell, DataSourceNote } from '@/components/ui/StatusBadge';
import Link from 'next/link';
import { THRESHOLDS } from '@/lib/thresholds';
import { getClientStatus, getCampaignStatusLabel, getDomainStatus } from '@/lib/thresholds';
import { notFound } from 'next/navigation';
import { getSmartleadClient } from '@/lib/smartlead/client';
import { today, daysAgo, campaignAction, domainAction } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getClientDetail(id: string) {
  try {
    const sl = getSmartleadClient();
    const clientId = parseInt(id, 10);
    if (isNaN(clientId)) return null;

    const end = today();
    const start7 = daysAgo(7);

    const [clients, campaigns, clientStats, campaignStats, responseStats, domainMetrics] = await Promise.all([
      sl.listClients().catch(() => []),
      sl.listCampaigns(clientId).catch(() => []),
      sl.getClientOverallStats(start7, end).catch(() => []),
      sl.getCampaignOverallStats(start7, end, clientId).catch(() => []),
      sl.getCampaignResponseStats(start7, end, clientId).catch(() => []),
      sl.getDomainHealthMetrics(start7, end, clientId).catch(() => []),
    ]);

    const client = clients.find(c => c.id === clientId);
    if (!client) return null;

    const cStats = clientStats.find(s => s.client_id === clientId);
    const statsMap = new Map(campaignStats.map(s => [s.campaign_id, s]));
    const responseMap = new Map(responseStats.map(r => [r.campaign_id, r]));

    const sentCount = cStats?.sent_count ?? 0;
    const replyRate = cStats?.reply_rate ?? 0;
    const bounceRate = cStats?.bounce_rate ?? 0;
    const posRepliesRaw = cStats?.positive_reply_count ?? 0;
    const positiveReplies = posRepliesRaw > 0 ? posRepliesRaw : null;

    const riskDomains = domainMetrics.filter(d => d.bounce_rate > THRESHOLDS.bounceRateCritical).length;
    const activeDomains = domainMetrics.filter(d => d.sent_count > 0).length;

    const campaignRows = campaigns.map(c => {
      const stats = statsMap.get(c.id);
      const resp = responseMap.get(c.id);
      const sent = stats?.sent_count ?? 0;
      const rr = stats?.reply_rate ?? 0;
      const br = stats?.bounce_rate ?? 0;
      const pr = resp ? resp.interested_count : null;
      const prr = sent > 0 && pr !== null ? (pr / sent) * 100 : null;
      const label = getCampaignStatusLabel(sent, rr, br, prr);
      return {
        campaign_id: c.id,
        campaign_name: c.name,
        status: c.status,
        sent_7d: sent,
        replies_7d: stats?.reply_count ?? 0,
        positive_replies: pr,
        reply_rate: rr,
        positive_reply_rate: prr,
        bounce_rate: br,
        bounces: stats?.bounce_count ?? 0,
        status_label: label,
        recommended_action: campaignAction(label),
      };
    }).sort((a, b) => b.sent_7d - a.sent_7d);

    const domainRows = domainMetrics.map(d => {
      const ds = getDomainStatus(d.bounce_rate, d.reply_rate, 0, 0, d.sent_count);
      return {
        domain: d.domain,
        status: ds,
        inbox_count: d.inbox_count ?? 0,
        active_count: 0,
        disc_count: 0,
        warmup_active: 0,
        warmup_inactive: 0,
        sent: d.sent_count,
        replies: d.reply_count,
        bounces: d.bounce_count,
        reply_rate: d.reply_rate,
        bounce_rate: d.bounce_rate,
        recommended_action: domainAction(ds, d.bounce_rate),
      };
    }).sort((a, b) => b.bounce_rate - a.bounce_rate || b.sent - a.sent);

    return {
      client: {
        client_id: clientId,
        client_name: client.name,
        email: client.email,
        status: getClientStatus(riskDomains, 0, bounceRate),
      },
      metrics: {
        sent_7d: sentCount,
        replies_7d: cStats?.reply_count ?? 0,
        positive_replies_7d: positiveReplies,
        reply_rate: replyRate,
        bounce_rate: bounceRate,
        active_campaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
        total_campaigns: campaigns.length,
        active_domains: activeDomains,
        risk_domains: riskDomains,
        active_inboxes: 0,
        disconnected_inboxes: 0,
      },
      campaigns: campaignRows,
      domains: domainRows,
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
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, display: 'flex', gap: 8 }}>
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Overview</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-secondary)' }}>{client.client_name}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <StatusBadge status={client.status} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {metrics.active_campaigns} active campaign{metrics.active_campaigns !== 1 ? 's' : ''} ·{' '}
            {metrics.active_domains} domain{metrics.active_domains !== 1 ? 's' : ''}
          </span>
        </div>

        <StatGrid cols={hasPositive ? 6 : 5}>
          <StatCard label="Sent (7d)" value={metrics.sent_7d?.toLocaleString()}
            dataSource="Source: /analytics/client/overall-stats (last 7 days)" />
          <StatCard label="Replies (7d)" value={metrics.replies_7d?.toLocaleString()} />
          {hasPositive && (
            <StatCard label="Pos. Replies (7d)" value={metrics.positive_replies_7d?.toString()}
              valueClass="num-healthy"
              dataSource="Source: /analytics/client/overall-stats (positive_reply_count)" />
          )}
          <StatCard label="Reply Rate" value={`${(metrics.reply_rate ?? 0).toFixed(1)}%`}
            valueClass={metrics.reply_rate < THRESHOLDS.replyRateWarning ? 'num-watch' : 'num-healthy'} />
          <StatCard label="Bounce Rate" value={`${(metrics.bounce_rate ?? 0).toFixed(2)}%`}
            valueClass={metrics.bounce_rate > THRESHOLDS.bounceRateCritical ? 'num-risk' : metrics.bounce_rate > THRESHOLDS.bounceRateWarning ? 'num-watch' : ''} />
          {metrics.risk_domains > 0 && (
            <StatCard label="Risk Domains" value={metrics.risk_domains} valueClass="num-risk" />
          )}
        </StatGrid>

        {/* Campaigns */}
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
                    c.status_label === 'Pause Review' || c.status_label === 'Deliverability Risk' ? 'row-risk' :
                    c.status_label === 'Watch' || c.status_label === 'Copy/List Issue' ? 'row-watch' : 'row-healthy'
                  }>
                    <td style={{ maxWidth: 220 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

        {/* Domains */}
        <div>
          <div className="section-header">
            <div className="section-title">Domains</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <DataSourceNote note="Source: /analytics/mailbox/domain-wise-health-metrics (per client, last 7 days)" />
              Last 7 days
            </div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Status</th>
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
                  <tr><td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No domain data available.</td></tr>
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
