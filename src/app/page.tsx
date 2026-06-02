import { Topbar } from '@/components/layout/Topbar';
import { OverviewClientTable } from '@/components/overview/OverviewClientTable';
import { getSmartleadClient } from '@/lib/smartlead/client';
import { getClientStatus, getCampaignStatusLabel } from '@/lib/thresholds';
import { today, daysAgo } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getOverviewData() {
  try {
    const sl = getSmartleadClient();
    const end = today();
    const start7 = daysAgo(7);

    const [clients, campaigns, clientStats, campaignStats, responseStats] = await Promise.all([
      sl.listClients(),
      sl.listCampaigns(),
      sl.getClientOverallStats(start7, end).catch(() => []),
      sl.getCampaignOverallStats(start7, end).catch(() => []),
      sl.getCampaignResponseStats(start7, end).catch(() => []),
    ]);

    // One domain-health call per client to get per-client domain counts
    const clientDomainMetrics = await Promise.all(
      clients.map(c => sl.getDomainHealthMetrics(start7, end, c.id).catch(() => []))
    );

    const clientStatsMap = new Map(clientStats.map(s => [s.client_id, s]));
    const campaignStatsMap = new Map(campaignStats.map(s => [s.campaign_id, s]));
    const responseMap = new Map(responseStats.map(r => [r.campaign_id, r]));

    const rows = clients.map((client, idx) => {
      const cid = client.id;
      const stats = clientStatsMap.get(cid);
      const domainMetrics = clientDomainMetrics[idx];

      const clientCampaigns = campaigns.filter(c => c.client_id === cid);
      const activeCampaigns = clientCampaigns.filter(c => c.status === 'ACTIVE').length;

      const sentCount = stats?.sent_count ?? 0;
      const replyCount = stats?.reply_count ?? 0;
      const bounceCount = stats?.bounce_count ?? 0;
      const replyRate = stats?.reply_rate ?? 0;
      const bounceRate = stats?.bounce_rate ?? 0;
      const posRepliesRaw = stats?.positive_reply_count ?? 0;
      const positiveReplies = posRepliesRaw > 0 ? posRepliesRaw : null;
      const positiveReplyRate = sentCount > 0 && positiveReplies !== null
        ? (positiveReplies / sentCount) * 100
        : null;

      const riskDomains = domainMetrics.filter(d => d.bounce_rate > 3.0).length;
      const activeDomains = domainMetrics.filter(d => d.sent_count > 0).length;

      const needsReview = clientCampaigns.filter(c => {
        const cs = campaignStatsMap.get(c.id);
        if (!cs) return false;
        const resp = responseMap.get(c.id);
        const posRate = cs.sent_count > 0 && resp
          ? (resp.interested_count / cs.sent_count) * 100
          : null;
        const label = getCampaignStatusLabel(cs.sent_count, cs.reply_rate, cs.bounce_rate, posRate);
        return ['Pause Review', 'Deliverability Risk', 'Copy/List Issue'].includes(label);
      }).length;

      return {
        client_id: cid,
        client_name: client.name,
        active_campaigns: activeCampaigns,
        active_domains: activeDomains,
        active_inboxes: 0,
        sent_7d: sentCount,
        replies_7d: replyCount,
        positive_replies_7d: positiveReplies,
        reply_rate: replyRate,
        positive_reply_rate: positiveReplyRate,
        bounce_rate: bounceRate,
        risk_domains: riskDomains,
        disconnected_inboxes: 0,
        campaigns_needing_review: needsReview,
        status: getClientStatus(riskDomains, 0, bounceRate),
      };
    });

    return { clients: rows, lastSync: new Date().toISOString(), synced: true };
  } catch {
    return { clients: [], lastSync: null, synced: false };
  }
}

export default async function OverviewPage() {
  const data = await getOverviewData();
  return (
    <>
      <Topbar title="Client Overview" subtitle="All clients — last 7 days" />
      <div className="page-body">
        <OverviewClientTable data={data} />
      </div>
    </>
  );
}
