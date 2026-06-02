import { Topbar } from '@/components/layout/Topbar';
import { CampaignsTable } from '@/components/campaigns/CampaignsTable';
import { getSmartleadClient } from '@/lib/smartlead/client';
import { getCampaignStatusLabel } from '@/lib/thresholds';
import { today, daysAgo, campaignAction } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getCampaignsData(clientId?: string, status?: string) {
  try {
    const sl = getSmartleadClient();
    const end = today();
    const start7 = daysAgo(7);
    const cid = clientId ? parseInt(clientId, 10) : undefined;

    const [campaigns, clients, campaignStats, responseStats] = await Promise.all([
      sl.listCampaigns(cid),
      sl.listClients().catch(() => []),
      sl.getCampaignOverallStats(start7, end, cid).catch(() => []),
      sl.getCampaignResponseStats(start7, end, cid).catch(() => []),
    ]);

    const clientMap = new Map(clients.map(c => [c.id, c.name]));
    const statsMap = new Map(campaignStats.map(s => [s.campaign_id, s]));
    const responseMap = new Map(responseStats.map(r => [r.campaign_id, r]));

    const rows = campaigns
      .filter(c => !status || c.status === status)
      .map(c => {
        const stats = statsMap.get(c.id);
        const resp = responseMap.get(c.id);
        const sentCount = stats?.sent_count ?? 0;
        const replyRate = stats?.reply_rate ?? 0;
        const bounceRate = stats?.bounce_rate ?? 0;
        const positiveReplies = resp ? resp.interested_count : null;
        const positiveReplyRate = sentCount > 0 && positiveReplies !== null
          ? (positiveReplies / sentCount) * 100
          : null;
        const label = getCampaignStatusLabel(sentCount, replyRate, bounceRate, positiveReplyRate);
        return {
          campaign_id: c.id,
          campaign_name: c.name,
          campaign_status: c.status,
          client_id: c.client_id ?? undefined,
          client_name: c.client_id ? (clientMap.get(c.client_id) ?? undefined) : undefined,
          sent_7d: sentCount,
          replies_7d: stats?.reply_count ?? 0,
          positive_replies: positiveReplies,
          bounces: stats?.bounce_count ?? 0,
          reply_rate: replyRate,
          positive_reply_rate: positiveReplyRate,
          bounce_rate: bounceRate,
          status_label: label,
          recommended_action: campaignAction(label),
        };
      })
      .sort((a, b) => {
        const ord = (s: string) => s === 'ACTIVE' ? 0 : s === 'PAUSED' ? 1 : 2;
        const d = ord(a.campaign_status) - ord(b.campaign_status);
        return d !== 0 ? d : b.sent_7d - a.sent_7d;
      });

    return {
      campaigns: rows,
      clients: clients.map(c => ({ client_id: c.id, client_name: c.name })),
      lastSync: new Date().toISOString(),
      synced: true,
    };
  } catch {
    return { campaigns: [], clients: [], lastSync: null, synced: false };
  }
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const data = await getCampaignsData(sp.client_id, sp.status);

  return (
    <>
      <Topbar title="Campaign Performance" subtitle={`${data.campaigns.length} campaigns · last 7 days`} />
      <div className="page-body">
        <CampaignsTable data={data} />
      </div>
    </>
  );
}
