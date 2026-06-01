import { type NextRequest } from 'next/server';
import { getDb, getLastSync } from '@/lib/db';
import { getClientStatus } from '@/lib/thresholds';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const db = getDb();
    const dateToday = new Date().toISOString().split('T')[0];

    const clients = db.prepare(`SELECT * FROM clients_snapshot ORDER BY client_name`).all() as any[];
    const lastSync = getLastSync(db, 'full');

    const rows = clients.map(client => {
      // Campaign counts
      const campaigns = db.prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active
         FROM campaigns_snapshot WHERE client_id = ?`
      ).get(client.client_id) as any;

      // Inbox counts
      const inboxes = db.prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN smtp_status = 1 AND imap_status = 1 THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN smtp_status = 0 OR imap_status = 0 THEN 1 ELSE 0 END) as disconnected
         FROM inboxes_snapshot WHERE client_id = ?`
      ).get(client.client_id) as any;

      // Domain counts (from inboxes)
      const domains = db.prepare(
        `SELECT COUNT(DISTINCT domain) as total FROM inboxes_snapshot WHERE client_id = ?`
      ).get(client.client_id) as any;

      // Campaign metrics aggregated
      const metrics = db.prepare(
        `SELECT
           SUM(sent) as sent_7d,
           SUM(replies) as replies_7d,
           SUM(positive_replies) as positive_replies_7d,
           SUM(bounces) as bounces_7d,
           AVG(reply_rate) as avg_reply_rate,
           AVG(positive_reply_rate) as avg_positive_reply_rate,
           AVG(bounce_rate) as avg_bounce_rate
         FROM campaigns_daily
         WHERE client_id = ? AND date = ?`
      ).get(client.client_id, dateToday) as any;

      // Risk domains: domains with bounce_rate > threshold
      const riskDomains = db.prepare(
        `SELECT COUNT(*) as count
         FROM domains_daily
         WHERE client_id = ? AND date = ? AND status IN ('Risk', 'Burned')`
      ).get(client.client_id, dateToday) as any;

      // Campaigns needing review
      const needsReview = db.prepare(
        `SELECT COUNT(*) as count FROM campaigns_daily
         WHERE client_id = ? AND date = ?
         AND status_label IN ('Pause Review', 'Deliverability Risk', 'Copy/List Issue')`
      ).get(client.client_id, dateToday) as any;

      const bounceRate = metrics?.avg_bounce_rate ?? 0;
      const disconnected = inboxes?.disconnected ?? 0;
      const riskCount = riskDomains?.count ?? 0;

      return {
        client_id: client.client_id,
        client_name: client.client_name,
        active_campaigns: campaigns?.active ?? 0,
        active_domains: domains?.total ?? 0,
        active_inboxes: inboxes?.active ?? 0,
        sent_today: 0, // NOT available per-day without analytics-by-date call
        sent_7d: metrics?.sent_7d ?? 0,
        replies_7d: metrics?.replies_7d ?? 0,
        positive_replies_7d: metrics?.positive_replies_7d ?? null,
        reply_rate_7d: metrics?.avg_reply_rate ?? 0,
        positive_reply_rate_7d: metrics?.avg_positive_reply_rate ?? null,
        bounce_rate_7d: bounceRate,
        risk_domains: riskCount,
        disconnected_inboxes: disconnected,
        campaigns_needing_review: needsReview?.count ?? 0,
        status: getClientStatus(riskCount, disconnected, bounceRate),
      };
    });

    return Response.json({
      clients: rows,
      lastSync: lastSync?.finished_at ?? null,
      synced: !!lastSync,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
