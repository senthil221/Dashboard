import { type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = req.nextUrl;
    const clientId = searchParams.get('client_id');
    const severity = searchParams.get('severity');
    const status = searchParams.get('status') ?? 'active';

    let query = `
      SELECT a.*, c.client_name
      FROM alerts a
      LEFT JOIN clients_snapshot c ON a.client_id = c.client_id
      WHERE a.status = ?
    `;
    const params: (string | number)[] = [status];

    if (clientId) {
      query += ` AND a.client_id = ?`;
      params.push(parseInt(clientId, 10));
    }
    if (severity) {
      query += ` AND a.severity = ?`;
      params.push(severity);
    }

    query += ` ORDER BY
      CASE a.severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
      a.last_updated_at DESC`;

    const alerts = db.prepare(query).all(...params) as any[];

    const counts = db.prepare(
      `SELECT severity, COUNT(*) as count FROM alerts WHERE status = 'active' GROUP BY severity`
    ).all() as any[];

    return Response.json({ alerts, counts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { id, status } = body;

    if (!id || !['active', 'resolved', 'snoozed'].includes(status)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    db.prepare(
      `UPDATE alerts SET status = ?, last_updated_at = datetime('now') WHERE id = ?`
    ).run(status, id);

    return Response.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
