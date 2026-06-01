import { type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = req.nextUrl;
    const clientId = searchParams.get('client_id');
    const problemType = searchParams.get('problem_type');

    let query = `
      SELECT ins.*, c.client_name
      FROM inboxes_snapshot ins
      LEFT JOIN clients_snapshot c ON ins.client_id = c.client_id
      WHERE ins.is_problem = 1
    `;
    const params: (string | number)[] = [];

    if (clientId) {
      query += ` AND ins.client_id = ?`;
      params.push(parseInt(clientId, 10));
    }
    if (problemType) {
      query += ` AND ins.problem_reason = ?`;
      params.push(problemType);
    }

    query += ` ORDER BY ins.problem_reason, ins.email`;

    const inboxes = db.prepare(query).all(...params) as any[];

    const problemTypeCounts = db.prepare(
      `SELECT problem_reason, COUNT(*) as count
       FROM inboxes_snapshot WHERE is_problem = 1
       GROUP BY problem_reason ORDER BY count DESC`
    ).all() as any[];

    return Response.json({ inboxes, problemTypeCounts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
