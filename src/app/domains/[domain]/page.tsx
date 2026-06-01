import { Topbar } from '@/components/layout/Topbar';
import { StatCard, StatGrid } from '@/components/ui/StatCards';
import { StatusBadge, RateBadge, NumCell, DataSourceNote } from '@/components/ui/StatusBadge';
import Link from 'next/link';
import { THRESHOLDS } from '@/lib/thresholds';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function getDomainDetail(domain: string) {
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();
    const dateToday = new Date().toISOString().split('T')[0];

    const summary = db.prepare(
      `SELECT dd.*, c.client_name
       FROM domains_daily dd
       LEFT JOIN clients_snapshot c ON dd.client_id = c.client_id
       WHERE dd.domain = ? AND dd.date = ?`
    ).get(domain, dateToday) as any;

    if (!summary) return null;

    const inboxStats = db.prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN smtp_status=1 AND imap_status=1 THEN 1 ELSE 0 END) as active,
              SUM(CASE WHEN smtp_status=0 OR imap_status=0 THEN 1 ELSE 0 END) as disconnected,
              SUM(warmup_status) as warmup_active,
              SUM(CASE WHEN warmup_status=0 THEN 1 ELSE 0 END) as warmup_inactive
       FROM inboxes_snapshot WHERE domain = ?`
    ).get(domain) as any;

    const warmupRep = db.prepare(
      `SELECT AVG(wsc.warmup_reputation) as avg_rep
       FROM warmup_stats_cache wsc
       JOIN inboxes_snapshot ins ON wsc.email_account_id = ins.email_account_id
       WHERE ins.domain = ?`
    ).get(domain) as any;

    const problemInboxes = db.prepare(
      `SELECT * FROM inboxes_snapshot WHERE domain = ? AND is_problem = 1 ORDER BY problem_reason, email`
    ).all(domain) as any[];

    const campaigns = db.prepare(
      `SELECT DISTINCT cs.campaign_id, cs.campaign_name, cs.status,
              cd.sent as sent_7d, cd.replies as replies_7d, cd.bounce_rate, cd.status_label, cd.recommended_action
       FROM campaigns_snapshot cs
       JOIN inboxes_snapshot ins ON ins.client_id = cs.client_id
       LEFT JOIN campaigns_daily cd ON cs.campaign_id = cd.campaign_id AND cd.date = ?
       WHERE ins.domain = ?
       ORDER BY COALESCE(cd.sent, 0) DESC`
    ).all(dateToday, domain) as any[];

    return {
      summary: {
        ...summary,
        inbox_count: inboxStats?.total ?? 0,
        active_inbox_count: inboxStats?.active ?? 0,
        disconnected_inbox_count: inboxStats?.disconnected ?? 0,
        warmup_active_count: inboxStats?.warmup_active ?? 0,
        warmup_inactive_count: inboxStats?.warmup_inactive ?? 0,
        avg_warmup_reputation: warmupRep?.avg_rep ?? null,
      },
      problem_inboxes: problemInboxes,
      campaigns,
    };
  } catch {
    return null;
  }
}

export default async function DomainDetailPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const domainName = decodeURIComponent(domain);
  const data = await getDomainDetail(domainName);

  if (!data) return notFound();

  const { summary, problem_inboxes, campaigns } = data;

  return (
    <>
      <Topbar title={domainName} subtitle={`Domain drilldown · ${summary.client_name ?? 'Unknown client'}`} />
      <div className="page-body">
        {/* Breadcrumb */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, display: 'flex', gap: 8 }}>
          <Link href="/domains" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Domains</Link>
          <span>/</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{domainName}</span>
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <StatusBadge status={summary.status} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {summary.inbox_count} inbox{summary.inbox_count !== 1 ? 'es' : ''} ·{' '}
            {summary.active_inbox_count} active ·{' '}
            {summary.disconnected_inbox_count > 0 && (
              <span className="num-watch">{summary.disconnected_inbox_count} disconnected · </span>
            )}
            {summary.client_name ?? 'No client'}
          </span>
          {summary.recommended_action && (
            <div style={{
              background: 'var(--bg-raised)', border: '1px solid var(--bg-border)',
              padding: '4px 12px', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)',
            }}>
              ⚡ {summary.recommended_action}
            </div>
          )}
        </div>

        <StatGrid cols={6}>
          <StatCard label="Sent (7d)" value={summary.sent?.toLocaleString()}
            dataSource="Source: /analytics/mailbox/domain-wise-health-metrics (last 7 days)" />
          <StatCard label="Replies (7d)" value={summary.replies?.toLocaleString()} />
          <StatCard label="Bounces (7d)" value={summary.bounces?.toLocaleString()}
            valueClass={summary.bounce_rate > THRESHOLDS.bounceRateWarning ? 'num-risk' : ''} />
          <StatCard label="Reply Rate" value={`${(summary.reply_rate ?? 0).toFixed(1)}%`}
            valueClass={summary.reply_rate < THRESHOLDS.replyRateWarning ? 'num-watch' : 'num-healthy'} />
          <StatCard label="Bounce Rate" value={`${(summary.bounce_rate ?? 0).toFixed(2)}%`}
            valueClass={summary.bounce_rate > THRESHOLDS.bounceRateCritical ? 'num-risk' : summary.bounce_rate > THRESHOLDS.bounceRateWarning ? 'num-watch' : ''} />
          <StatCard label="Avg Warmup Rep."
            value={summary.avg_warmup_reputation != null ? summary.avg_warmup_reputation.toFixed(0) : '—'}
            valueClass={summary.avg_warmup_reputation != null && summary.avg_warmup_reputation < THRESHOLDS.warmupReputationCritical ? 'num-risk' : summary.avg_warmup_reputation != null && summary.avg_warmup_reputation < THRESHOLDS.warmupReputationWarning ? 'num-watch' : ''}
            dataSource="Source: /email-accounts/{id}/warmup-stats (cached). Only available if warmup stats have been synced." />
        </StatGrid>

        {/* Inbox summary cards */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Total Inboxes', value: summary.inbox_count },
            { label: 'Active', value: summary.active_inbox_count, cls: 'num-healthy' },
            { label: 'Disconnected', value: summary.disconnected_inbox_count, cls: summary.disconnected_inbox_count > 0 ? 'num-risk' : '' },
            { label: 'Warmup On', value: summary.warmup_active_count },
            { label: 'Warmup Off', value: summary.warmup_inactive_count, cls: summary.warmup_inactive_count > 0 ? 'num-watch' : '' },
          ].map(item => (
            <div key={item.label} className="stat-card" style={{ minWidth: 120 }}>
              <div className="label">{item.label}</div>
              <div className={`value font-mono ${item.cls ?? ''}`} style={{ fontSize: 18 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Campaigns using this domain */}
        <div style={{ marginBottom: 28 }}>
          <div className="section-header">
            <div className="section-title">Campaigns using this domain</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <DataSourceNote note="Campaigns associated to this domain via inbox assignments in /campaigns/{id}/email-accounts" />
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
                  <th>Bounce %</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No campaigns found for this domain.</td></tr>
                ) : campaigns.map((c: any) => (
                  <tr key={c.campaign_id}>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{c.campaign_name}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>{c.status_label ? <StatusBadge status={c.status_label} /> : '—'}</td>
                    <td><NumCell value={c.sent_7d} /></td>
                    <td><NumCell value={c.replies_7d} /></td>
                    <td><RateBadge value={c.bounce_rate} warningThreshold={THRESHOLDS.bounceRateWarning} criticalThreshold={THRESHOLDS.bounceRateCritical} lowerIsBetter={true} /></td>
                    <td style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{c.recommended_action ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Problem inboxes only */}
        <div>
          <div className="section-header">
            <div className="section-title">
              Problem Inboxes
              {problem_inboxes.length > 0 && (
                <span className="badge badge-risk" style={{ marginLeft: 8 }}>{problem_inboxes.length}</span>
              )}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Only showing problematic inboxes (SMTP/IMAP failed, warmup off, suspended)
            </span>
          </div>

          {problem_inboxes.length === 0 ? (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, padding: '24px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--status-healthy)' }}>✓</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No problem inboxes detected on this domain.</span>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Problem</th>
                    <th>SMTP</th>
                    <th>IMAP</th>
                    <th>Warmup</th>
                    <th>Daily Sent</th>
                    <th>Max/Day</th>
                  </tr>
                </thead>
                <tbody>
                  {problem_inboxes.map((inbox: any) => (
                    <tr key={inbox.email_account_id} className="row-risk">
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{inbox.email}</td>
                      <td>
                        <span className="badge badge-risk">{inbox.problem_reason}</span>
                      </td>
                      <td>{inbox.smtp_status ? '✓' : <span className="num-risk">✗</span>}</td>
                      <td>{inbox.imap_status ? '✓' : <span className="num-risk">✗</span>}</td>
                      <td>{inbox.warmup_status ? <span className="num-healthy">On</span> : <span className="num-watch">Off</span>}</td>
                      <td><NumCell value={inbox.daily_sent_count} /></td>
                      <td><NumCell value={inbox.max_email_per_day} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
