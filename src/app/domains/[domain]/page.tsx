import { Topbar } from '@/components/layout/Topbar';
import { StatCard, StatGrid } from '@/components/ui/StatCards';
import { StatusBadge, RateBadge, NumCell } from '@/components/ui/StatusBadge';
import Link from 'next/link';
import { THRESHOLDS } from '@/lib/thresholds';
import { getDomainStatus } from '@/lib/thresholds';
import { notFound } from 'next/navigation';
import { getSmartleadClient } from '@/lib/smartlead/client';
import { today, daysAgo, domainAction } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getDomainDetail(domain: string) {
  try {
    const sl = getSmartleadClient();
    const end = today();
    const start7 = daysAgo(7);

    const [domainMetrics, mailboxMetrics] = await Promise.all([
      sl.getDomainHealthMetrics(start7, end).catch(() => []),
      sl.getMailboxHealthMetrics(start7, end).catch(() => []),
    ]);

    const domainStats = domainMetrics.find(d => d.domain.toLowerCase() === domain.toLowerCase());
    if (!domainStats) return null;

    // Per-inbox performance for this domain
    const domainMailboxes = mailboxMetrics.filter(m =>
      m.email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)
    );

    const status = getDomainStatus(domainStats.bounce_rate, domainStats.reply_rate, 0, 0, domainStats.sent_count);

    // Flag inboxes with performance issues
    const problemMailboxes = domainMailboxes
      .filter(m =>
        m.bounce_rate > THRESHOLDS.bounceRateWarning ||
        (m.sent_count > 50 && m.reply_count === 0)
      )
      .map(m => ({
        email_account_id: 0,
        email: m.email,
        domain,
        client_id: null,
        smtp_status: 1,
        imap_status: 1,
        warmup_status: 0,
        daily_sent_count: m.sent_count,
        max_email_per_day: 0,
        is_problem: 1,
        problem_reason: m.bounce_rate > THRESHOLDS.bounceRateCritical
          ? 'High Bounce Rate'
          : m.bounce_rate > THRESHOLDS.bounceRateWarning
          ? 'Elevated Bounce Rate'
          : 'No Replies (7d)',
      }));

    return {
      summary: {
        domain,
        client_name: null as string | null,
        sent: domainStats.sent_count,
        replies: domainStats.reply_count,
        bounces: domainStats.bounce_count,
        reply_rate: domainStats.reply_rate,
        bounce_rate: domainStats.bounce_rate,
        status,
        recommended_action: domainAction(status, domainStats.bounce_rate),
        inbox_count: domainMailboxes.length,
        active_inbox_count: domainMailboxes.filter(m => m.sent_count > 0).length,
        disconnected_inbox_count: 0,
        warmup_active_count: 0,
        warmup_inactive_count: 0,
        avg_warmup_reputation: null as number | null,
      },
      problem_inboxes: problemMailboxes,
      campaigns: [] as any[],
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

  const { summary, problem_inboxes } = data;

  return (
    <>
      <Topbar title={domainName} subtitle={`Domain drilldown · last 7 days`} />
      <div className="page-body">
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, display: 'flex', gap: 8 }}>
          <Link href="/domains" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Domains</Link>
          <span>/</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{domainName}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <StatusBadge status={summary.status} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {summary.inbox_count} inbox{summary.inbox_count !== 1 ? 'es' : ''} with activity ·{' '}
            {summary.active_inbox_count} sending
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

        <StatGrid cols={5}>
          <StatCard label="Sent (7d)" value={summary.sent?.toLocaleString()}
            dataSource="Source: /analytics/mailbox/domain-wise-health-metrics (last 7 days)" />
          <StatCard label="Replies (7d)" value={summary.replies?.toLocaleString()} />
          <StatCard label="Bounces (7d)" value={summary.bounces?.toLocaleString()}
            valueClass={summary.bounce_rate > THRESHOLDS.bounceRateWarning ? 'num-risk' : ''} />
          <StatCard label="Reply Rate" value={`${(summary.reply_rate ?? 0).toFixed(1)}%`}
            valueClass={summary.reply_rate < THRESHOLDS.replyRateWarning ? 'num-watch' : 'num-healthy'} />
          <StatCard label="Bounce Rate" value={`${(summary.bounce_rate ?? 0).toFixed(2)}%`}
            valueClass={summary.bounce_rate > THRESHOLDS.bounceRateCritical ? 'num-risk' : summary.bounce_rate > THRESHOLDS.bounceRateWarning ? 'num-watch' : ''} />
        </StatGrid>

        <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Inboxes w/ Activity', value: summary.inbox_count },
            { label: 'Sending', value: summary.active_inbox_count, cls: 'num-healthy' },
            { label: 'Performance Issues', value: problem_inboxes.length, cls: problem_inboxes.length > 0 ? 'num-risk' : '' },
          ].map(item => (
            <div key={item.label} className="stat-card" style={{ minWidth: 140 }}>
              <div className="label">{item.label}</div>
              <div className={`value font-mono ${item.cls ?? ''}`} style={{ fontSize: 18 }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="section-header">
            <div className="section-title">
              Performance Issues
              {problem_inboxes.length > 0 && (
                <span className="badge badge-risk" style={{ marginLeft: 8 }}>{problem_inboxes.length}</span>
              )}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Inboxes with high bounce rate or no replies (last 7 days) · SMTP/IMAP status not available in live mode
            </span>
          </div>

          {problem_inboxes.length === 0 ? (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, padding: '24px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--status-healthy)' }}>✓</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No performance issues detected on this domain.</span>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Issue</th>
                    <th>Sent (7d)</th>
                  </tr>
                </thead>
                <tbody>
                  {problem_inboxes.map((inbox: any) => (
                    <tr key={inbox.email} className="row-risk">
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{inbox.email}</td>
                      <td>
                        <span className="badge badge-risk">{inbox.problem_reason}</span>
                      </td>
                      <td><NumCell value={inbox.daily_sent_count} /></td>
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
