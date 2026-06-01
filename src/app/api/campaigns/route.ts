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
        cs.campaign_id, cs.campaign_name, cs.status as campaign_status,
        cs.client_id,
        c.client_name,
        cd.sent as sent_7d,
        cd.replies as replies_7d,
        cd.positive_replies as positive_replies_7d,
        cd.bounces,
        cd.reply_rate,
        cd.positive_reply_rate,
        cd.bounce_rate,
        cd.status_label,
        cd.recommended_action
      FROM campaigns_snapshot cs
      LEFT JOIN clients_snapshot c ON cs.client_id = c.client_id
      LEFT JOIN campaigns_daily cd ON cs.campaign_id = cd.campaign_id AND cd.date = ?
      WHERE 1=1
    `;
    const params: (string | number)[] = [dateToday];

    if (clientId) {
      query += ` AND cs.client_id = ?`;
      params.push(parseInt(clientId, 10));
    }
    if (status) {
      query += ` AND cs.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY COALESCE(cd.sent, 0) DESC, cs.campaign_name`;

    const rows = db.prepare(query).all(...params) as any[];

    return Response.json({ campaigns: rows, date: dateToday });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
