import { Topbar } from '@/components/layout/Topbar';
import { CampaignsTable } from '@/components/campaigns/CampaignsTable';

export const dynamic = 'force-dynamic';

async function getCampaignsData(clientId?: string, status?: string) {
  try {
    const { getDb, getLastSync } = await import('@/lib/db');
    const db = getDb();
    const dateToday = new Date().toISOString().split('T')[0];
    const lastSync = getLastSync(db, 'full');

    let query = `
      SELECT cs.campaign_id, cs.campaign_name, cs.status as campaign_status,
             cs.client_id, c.client_name,
             cd.sent as sent_7d, cd.replies as replies_7d, cd.positive_replies,
             cd.bounces, cd.reply_rate, cd.positive_reply_rate, cd.bounce_rate,
             cd.status_label, cd.recommended_action
      FROM campaigns_snapshot cs
      LEFT JOIN clients_snapshot c ON cs.client_id = c.client_id
      LEFT JOIN campaigns_daily cd ON cs.campaign_id = cd.campaign_id AND cd.date = ?
      WHERE 1=1
    `;
    const params: (string | number)[] = [dateToday];

    if (clientId) { query += ` AND cs.client_id = ?`; params.push(parseInt(clientId)); }
    if (status) { query += ` AND cs.status = ?`; params.push(status); }

    query += ` ORDER BY
      CASE cs.status WHEN 'ACTIVE' THEN 1 WHEN 'PAUSED' THEN 2 ELSE 3 END,
      COALESCE(cd.sent, 0) DESC`;

    const campaigns = db.prepare(query).all(...params) as any[];
    const clients = db.prepare(`SELECT client_id, client_name FROM clients_snapshot ORDER BY client_name`).all() as any[];

    return { campaigns, clients, lastSync: lastSync?.finished_at ?? null, synced: !!lastSync };
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
