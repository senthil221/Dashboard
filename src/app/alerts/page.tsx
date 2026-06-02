import { Topbar } from '@/components/layout/Topbar';
import { AlertsTable } from '@/components/alerts/AlertsTable';
import { getSmartleadClient } from '@/lib/smartlead/client';
import { getCampaignStatusLabel, THRESHOLDS } from '@/lib/thresholds';
import { today, daysAgo } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

async function getAlertsData(clientId?: string, severity?: string) {
  try {
    const sl = getSmartleadClient();
    const end = today();
    const start7 = daysAgo(7);
    const cid = clientId ? parseInt(clientId, 10) : undefined;

    const [clients, campaigns, campaignStats, responseStats, domainMetrics] = await Promise.all([
      sl.listClients().catch(() => []),
      sl.listCampaigns(cid).catch(() => []),
      sl.getCampaignOverallStats(start7, end, cid).catch(() => []),
      sl.getCampaignResponseStats(start7, end, cid).catch(() => []),
      sl.getDomainHealthMetrics(start7, end, cid).catch(() => []),
    ]);

    const clientMap = new Map(clients.map(c => [c.id, c.name]));
    const statsMap = new Map(campaignStats.map(s => [s.campaign_id, s]));
    const responseMap = new Map(responseStats.map(r => [r.campaign_id, r]));

    const now = new Date().toISOString();
    const alerts: AlertRow[] = [];

    // Domain alerts
    for (const d of domainMetrics) {
      if (d.sent_count < THRESHOLDS.minSendsForJudgement) continue;

      if (d.bounce_rate > THRESHOLDS.bounceRateCritical) {
        alerts.push({
          id: 0,
          object_type: 'Domain',
          object_id: d.domain,
          object_name: d.domain,
          alert_type: 'domain_high_bounce_rate',
          severity: d.bounce_rate > THRESHOLDS.bounceRateCritical * 2 ? 'Critical' : 'High',
          issue: `Bounce rate ${d.bounce_rate.toFixed(1)}% exceeds critical threshold (${THRESHOLDS.bounceRateCritical}%).`,
          recommended_action: 'Pause sending on this domain and investigate inbox health.',
          status: 'active',
          first_detected_at: now,
          last_updated_at: now,
        });
      } else if (d.bounce_rate > THRESHOLDS.bounceRateWarning) {
        alerts.push({
          id: 0,
          object_type: 'Domain',
          object_id: d.domain,
          object_name: d.domain,
          alert_type: 'domain_high_bounce_rate',
          severity: 'High',
          issue: `Bounce rate ${d.bounce_rate.toFixed(1)}% exceeds warning threshold (${THRESHOLDS.bounceRateWarning}%).`,
          recommended_action: 'Monitor domain and consider reducing send volume.',
          status: 'active',
          first_detected_at: now,
          last_updated_at: now,
        });
      }

      if (d.reply_count === 0) {
        alerts.push({
          id: 0,
          object_type: 'Domain',
          object_id: d.domain,
          object_name: d.domain,
          alert_type: 'domain_no_replies',
          severity: 'High',
          issue: `No replies after ${d.sent_count.toLocaleString()} sends in last 7 days.`,
          recommended_action: 'Check copy, targeting, and domain reputation.',
          status: 'active',
          first_detected_at: now,
          last_updated_at: now,
        });
      }
    }

    // Campaign alerts
    for (const c of campaigns) {
      const stats = statsMap.get(c.id);
      const resp = responseMap.get(c.id);
      const clientName = c.client_id ? (clientMap.get(c.client_id) ?? undefined) : undefined;

      if (c.status === 'ACTIVE' && (!stats || stats.sent_count === 0)) {
        alerts.push({
          id: 0,
          client_id: c.client_id ?? undefined,
          client_name: clientName,
          object_type: 'Campaign',
          object_id: String(c.id),
          object_name: c.name,
          alert_type: 'campaign_active_not_sending',
          severity: 'Medium',
          issue: `Campaign is ACTIVE but sent 0 emails in last 7 days.`,
          recommended_action: 'Check schedule, inbox assignments, and lead availability.',
          status: 'active',
          first_detected_at: now,
          last_updated_at: now,
        });
      }

      if (stats && stats.sent_count >= THRESHOLDS.minSendsForJudgement && stats.bounce_rate > THRESHOLDS.bounceRateCritical) {
        alerts.push({
          id: 0,
          client_id: c.client_id ?? undefined,
          client_name: clientName,
          object_type: 'Campaign',
          object_id: String(c.id),
          object_name: c.name,
          alert_type: 'campaign_high_bounce_rate',
          severity: 'Critical',
          issue: `Bounce rate ${stats.bounce_rate.toFixed(1)}% exceeds critical threshold.`,
          recommended_action: 'Pause campaign immediately and audit lead list quality.',
          status: 'active',
          first_detected_at: now,
          last_updated_at: now,
        });
      }

      if (stats && stats.sent_count >= THRESHOLDS.minSendsForJudgement) {
        const posRate = resp ? (resp.interested_count / stats.sent_count) * 100 : null;
        const label = getCampaignStatusLabel(stats.sent_count, stats.reply_rate, stats.bounce_rate, posRate);
        if (label === 'Copy/List Issue') {
          alerts.push({
            id: 0,
            client_id: c.client_id ?? undefined,
            client_name: clientName,
            object_type: 'Campaign',
            object_id: String(c.id),
            object_name: c.name,
            alert_type: 'campaign_no_replies',
            severity: 'Medium',
            issue: `Low reply rate (${stats.reply_rate.toFixed(1)}%) despite ${stats.sent_count.toLocaleString()} sends.`,
            recommended_action: 'Review copy quality and lead list targeting.',
            status: 'active',
            first_detected_at: now,
            last_updated_at: now,
          });
        }
      }
    }

    // Assign IDs and apply severity filter
    const numbered = alerts.map((a, i) => ({ ...a, id: i + 1 }));
    const filtered = severity ? numbered.filter(a => a.severity === severity) : numbered;

    const sorted = filtered.sort((a, b) => {
      const ord: Record<string, number> = { Critical: 1, High: 2, Medium: 3, Low: 4 };
      return (ord[a.severity] ?? 5) - (ord[b.severity] ?? 5);
    });

    const counts = ['Critical', 'High', 'Medium', 'Low']
      .map(sev => ({ severity: sev, count: numbered.filter(a => a.severity === sev).length }))
      .filter(c => c.count > 0);

    return {
      alerts: sorted,
      counts,
      clients: clients.map(c => ({ client_id: c.id, client_name: c.name })),
      lastSync: new Date().toISOString(),
      synced: true,
    };
  } catch {
    return { alerts: [], counts: [], clients: [], lastSync: null, synced: false };
  }
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; severity?: string }>;
}) {
  const sp = await searchParams;
  const data = await getAlertsData(sp.client_id, sp.severity);

  const totalActive = data.counts.reduce((sum, c) => sum + c.count, 0);
  const criticalCount = data.counts.find(c => c.severity === 'Critical')?.count ?? 0;

  return (
    <>
      <Topbar
        title={`Alerts ${totalActive > 0 ? `(${totalActive})` : ''}`}
        subtitle={criticalCount > 0 ? `⚠ ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} requiring immediate attention` : 'No critical alerts'}
      />
      <div className="page-body">
        <AlertsTable data={data} />
      </div>
    </>
  );
}
