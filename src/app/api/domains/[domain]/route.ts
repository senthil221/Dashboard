import { type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/domains/[domain]'>
) {
  try {
    const { domain } = await ctx.params;
    const domainName = decodeURIComponent(domain);
    const db = getDb();
    const dateToday = new Date().toISOString().split('T')[0];

    // Domain summary (most recent)
    const summary = db.prepare(
      `SELECT dd.*, c.client_name
       FROM domains_daily dd
       LEFT JOIN clients_snapshot c ON dd.client_id = c.client_id
       WHERE dd.domain = ? AND dd.date = ?`
    ).get(domainName, dateToday) as any;

    if (!summary) {
      return Response.json({ error: 'Domain not found' }, { status: 404 });
    }

    // Inbox counts for this domain
    const inboxStats = db.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN smtp_status=1 AND imap_status=1 THEN 1 ELSE 0 END) as active,
         SUM(CASE WHEN smtp_status=0 OR imap_status=0 THEN 1 ELSE 0 END) as disconnected,
         SUM(warmup_status) as warmup_active,
         SUM(CASE WHEN warmup_status=0 THEN 1 ELSE 0 END) as warmup_inactive,
         AVG(CASE WHEN warmup_status=1 THEN NULL ELSE NULL END) as avg_warmup_rep
       FROM inboxes_snapshot WHERE domain = ?`
    ).get(domainName) as any;

    // Warmup reputation from cache
    const warmupRep = db.prepare(
      `SELECT AVG(wc.warmup_reputation) as avg_rep
       FROM warmup_stats_cache wc
       JOIN inboxes_snapshot ins ON wc.email_account_id = ins.email_account_id
       WHERE ins.domain = ?`
    ).get(domainName) as any;

    // Problem inboxes only
    const problemInboxes = db.prepare(
      `SELECT * FROM inboxes_snapshot
       WHERE domain = ? AND is_problem = 1
       ORDER BY problem_reason`
    ).all(domainName) as any[];

    // Campaigns using this domain
    const campaigns = db.prepare(
      `SELECT DISTINCT cs.campaign_id, cs.campaign_name, cs.status,
              cd.sent as sent_7d, cd.replies as replies_7d,
              cd.bounce_rate, cd.status_label, cd.recommended_action
       FROM campaigns_snapshot cs
       LEFT JOIN campaigns_daily cd ON cs.campaign_id = cd.campaign_id AND cd.date = ?
       WHERE cs.campaign_id IN (
         SELECT DISTINCT campaign_id FROM inboxes_snapshot
         WHERE domain = ?
       )
       ORDER BY COALESCE(cd.sent, 0) DESC`
    ).all(dateToday, domainName) as any[];

    return Response.json({
      domain: domainName,
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
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
