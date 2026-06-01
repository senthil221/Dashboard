import { type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = req.nextUrl;
    const clientId = searchParams.get('client_id');
    const status = searchParams.get('status');
    const dateToday = new Date().toISOString().split('T')[0];

    let query = `
      SELECT
        dd.*,
        c.client_name,
        ins_stats.inbox_count,
        ins_stats.active_count as active_inbox_count,
        ins_stats.disc_count as disconnected_inbox_count,
        ins_stats.warmup_active as warmup_active_count,
        ins_stats.warmup_inactive as warmup_inactive_count
      FROM domains_daily dd
      LEFT JOIN clients_snapshot c ON dd.client_id = c.client_id
      LEFT JOIN (
        SELECT
          domain,
          client_id,
          COUNT(*) as inbox_count,
          SUM(CASE WHEN smtp_status=1 AND imap_status=1 THEN 1 ELSE 0 END) as active_count,
          SUM(CASE WHEN smtp_status=0 OR imap_status=0 THEN 1 ELSE 0 END) as disc_count,
          SUM(warmup_status) as warmup_active,
          SUM(CASE WHEN warmup_status=0 THEN 1 ELSE 0 END) as warmup_inactive
        FROM inboxes_snapshot
        GROUP BY domain, client_id
      ) ins_stats ON dd.domain = ins_stats.domain AND COALESCE(dd.client_id,-1) = COALESCE(ins_stats.client_id,-1)
      WHERE dd.date = ?
    `;
    const params: (string | number)[] = [dateToday];

    if (clientId) {
      query += ` AND dd.client_id = ?`;
      params.push(parseInt(clientId, 10));
    }
    if (status) {
      query += ` AND dd.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY dd.bounce_rate DESC, dd.sent DESC`;

    const rows = db.prepare(query).all(...params) as any[];

    return Response.json({ domains: rows, date: dateToday });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
