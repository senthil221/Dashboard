import { type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { getClientStatus } from '@/lib/thresholds';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/clients/[id]'>
) {
  try {
    const { id } = await ctx.params;
    const clientId = parseInt(id, 10);
    if (isNaN(clientId)) return Response.json({ error: 'Invalid client ID' }, { status: 400 });

    const db = getDb();
    const dateToday = new Date().toISOString().split('T')[0];

    const client = db.prepare(`SELECT * FROM clients_snapshot WHERE client_id = ?`).get(clientId) as any;
    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });

    // Top-level metrics
    const metrics = db.prepare(
      `SELECT
         SUM(sent) as sent_7d, SUM(replies) as replies_7d,
         SUM(COALESCE(positive_replies, 0)) as positive_replies_7d,
         SUM(bounces) as bounces_7d,
         SUM(sent) as total_sent,
         CASE WHEN SUM(sent) > 0 THEN (SUM(replies) * 100.0 / SUM(sent)) ELSE 0 END as reply_rate,
         CASE WHEN SUM(sent) > 0 THEN (SUM(bounces) * 100.0 / SUM(sent)) ELSE 0 END as bounce_rate
       FROM campaigns_daily WHERE client_id = ? AND date = ?`
    ).get(clientId, dateToday) as any;

    // Inbox summary
    const inboxes = db.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN smtp_status = 1 AND imap_status = 1 THEN 1 ELSE 0 END) as active,
         SUM(CASE WHEN smtp_status = 0 OR imap_status = 0 THEN 1 ELSE 0 END) as disconnected
       FROM inboxes_snapshot WHERE client_id = ?`
    ).get(clientId) as any;

    // Domain summary
    const domainCount = db.prepare(
      `SELECT COUNT(DISTINCT domain) as total FROM inboxes_snapshot WHERE client_id = ?`
    ).get(clientId) as any;

    const riskDomains = db.prepare(
      `SELECT COUNT(*) as count FROM domains_daily
       WHERE client_id = ? AND date = ? AND status IN ('Risk', 'Burned')`
    ).get(clientId, dateToday) as any;

    // Campaign table
    const campaigns = db.prepare(
      `SELECT cs.campaign_id, cs.campaign_name, cs.status,
              cd.sent as sent_7d, cd.replies as replies_7d,
              cd.positive_replies as positive_replies_7d,
              cd.reply_rate, cd.positive_reply_rate, cd.bounce_rate,
              cd.bounces, cd.status_label, cd.recommended_action
       FROM campaigns_snapshot cs
       LEFT JOIN campaigns_daily cd ON cs.campaign_id = cd.campaign_id AND cd.date = ?
       WHERE cs.client_id = ?
       ORDER BY COALESCE(cd.sent, 0) DESC`
    ).all(dateToday, clientId) as any[];

    // Domain table
    const domains = db.prepare(
      `SELECT dd.*, ins_stats.inbox_count, ins_stats.active_count, ins_stats.disc_count,
              ins_stats.warmup_active, ins_stats.warmup_inactive
       FROM domains_daily dd
       LEFT JOIN (
         SELECT domain,
           COUNT(*) as inbox_count,
           SUM(CASE WHEN smtp_status=1 AND imap_status=1 THEN 1 ELSE 0 END) as active_count,
           SUM(CASE WHEN smtp_status=0 OR imap_status=0 THEN 1 ELSE 0 END) as disc_count,
           SUM(CASE WHEN warmup_status=1 THEN 1 ELSE 0 END) as warmup_active,
           SUM(CASE WHEN warmup_status=0 THEN 1 ELSE 0 END) as warmup_inactive
         FROM inboxes_snapshot WHERE client_id = ?
         GROUP BY domain
       ) ins_stats ON dd.domain = ins_stats.domain
       WHERE dd.date = ? AND dd.client_id = ?
       ORDER BY dd.sent DESC, dd.bounce_rate DESC`
    ).all(clientId, dateToday, clientId) as any[];

    const riskCount = riskDomains?.count ?? 0;
    const disconnected = inboxes?.disconnected ?? 0;
    const bounceRate = metrics?.bounce_rate ?? 0;

    return Response.json({
      client: {
        client_id: clientId,
        client_name: client.client_name,
        status: getClientStatus(riskCount, disconnected, bounceRate),
      },
      metrics: {
        sent_7d: metrics?.sent_7d ?? 0,
        replies_7d: metrics?.replies_7d ?? 0,
        positive_replies_7d: metrics?.positive_replies_7d ?? null,
        reply_rate: metrics?.reply_rate ?? 0,
        bounce_rate: bounceRate,
        active_campaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
        total_campaigns: campaigns.length,
        active_domains: domainCount?.total ?? 0,
        risk_domains: riskCount,
        active_inboxes: inboxes?.active ?? 0,
        disconnected_inboxes: disconnected,
      },
      campaigns,
      domains,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
