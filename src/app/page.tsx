import { Topbar } from '@/components/layout/Topbar';
import { OverviewClientTable } from '@/components/overview/OverviewClientTable';

export const dynamic = 'force-dynamic';

async function getOverviewData() {
  try {
    const { getDb, getLastSync } = await import('@/lib/db');
    const { getClientStatus } = await import('@/lib/thresholds');
    const db = getDb();
    const dateToday = new Date().toISOString().split('T')[0];
    const lastSync = getLastSync(db, 'full');

    const clients = db.prepare(`SELECT * FROM clients_snapshot ORDER BY client_name`).all() as any[];

    const rows = clients.map((client: any) => {
      const campaigns = db.prepare(
        `SELECT COUNT(*) as total, SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) as active
         FROM campaigns_snapshot WHERE client_id = ?`
      ).get(client.client_id) as any;

      const inboxes = db.prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN smtp_status=1 AND imap_status=1 THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN smtp_status=0 OR imap_status=0 THEN 1 ELSE 0 END) as disconnected
         FROM inboxes_snapshot WHERE client_id = ?`
      ).get(client.client_id) as any;

      const domains = db.prepare(
        `SELECT COUNT(DISTINCT domain) as total FROM inboxes_snapshot WHERE client_id = ?`
      ).get(client.client_id) as any;

      const metrics = db.prepare(
        `SELECT SUM(sent) as sent_7d, SUM(replies) as replies_7d,
                SUM(COALESCE(positive_replies,0)) as positive_replies_7d,
                SUM(bounces) as bounces_7d,
                CASE WHEN SUM(sent)>0 THEN (SUM(replies)*100.0/SUM(sent)) ELSE 0 END as reply_rate,
                CASE WHEN SUM(sent)>0 THEN (SUM(bounces)*100.0/SUM(sent)) ELSE 0 END as bounce_rate,
                SUM(CASE WHEN positive_replies IS NOT NULL THEN 1 ELSE 0 END) as has_positive_data
         FROM campaigns_daily WHERE client_id=? AND date=?`
      ).get(client.client_id, dateToday) as any;

      const riskDomains = db.prepare(
        `SELECT COUNT(*) as count FROM domains_daily WHERE client_id=? AND date=? AND status IN ('Risk','Burned')`
      ).get(client.client_id, dateToday) as any;

      const needsReview = db.prepare(
        `SELECT COUNT(*) as count FROM campaigns_daily WHERE client_id=? AND date=?
         AND status_label IN ('Pause Review','Deliverability Risk','Copy/List Issue')`
      ).get(client.client_id, dateToday) as any;

      const riskCount = riskDomains?.count ?? 0;
      const disc = inboxes?.disconnected ?? 0;
      const bounceRate = metrics?.bounce_rate ?? 0;
      const sent7d = metrics?.sent_7d ?? 0;
      const positiveReplies = metrics?.positive_replies_7d ?? 0;
      const hasPositive = (metrics?.has_positive_data ?? 0) > 0;

      return {
        client_id: client.client_id,
        client_name: client.client_name,
        active_campaigns: campaigns?.active ?? 0,
        active_domains: domains?.total ?? 0,
        active_inboxes: inboxes?.active ?? 0,
        sent_7d: sent7d,
        replies_7d: metrics?.replies_7d ?? 0,
        positive_replies_7d: hasPositive ? positiveReplies : null,
        reply_rate: metrics?.reply_rate ?? 0,
        positive_reply_rate: hasPositive && sent7d > 0 ? (positiveReplies / sent7d) * 100 : null,
        bounce_rate: bounceRate,
        risk_domains: riskCount,
        disconnected_inboxes: disc,
        campaigns_needing_review: needsReview?.count ?? 0,
        status: getClientStatus(riskCount, disc, bounceRate),
      };
    });

    return { clients: rows, lastSync: lastSync?.finished_at ?? null, synced: !!lastSync };
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
