import { Topbar } from '@/components/layout/Topbar';
import { InboxExceptionsTable } from '@/components/inboxes/InboxExceptionsTable';

export const dynamic = 'force-dynamic';

async function getInboxExceptions(clientId?: string, problemType?: string) {
  try {
    const { getDb, getLastSync } = await import('@/lib/db');
    const db = getDb();
    const lastSync = getLastSync(db, 'full');

    let query = `
      SELECT ins.*, c.client_name
      FROM inboxes_snapshot ins
      LEFT JOIN clients_snapshot c ON ins.client_id = c.client_id
      WHERE ins.is_problem = 1
    `;
    const params: (string | number)[] = [];

    if (clientId) { query += ` AND ins.client_id = ?`; params.push(parseInt(clientId)); }
    if (problemType) { query += ` AND ins.problem_reason = ?`; params.push(problemType); }

    query += ` ORDER BY ins.problem_reason, ins.domain, ins.email`;

    const inboxes = db.prepare(query).all(...params) as any[];

    const typeCounts = db.prepare(
      `SELECT problem_reason, COUNT(*) as count FROM inboxes_snapshot
       WHERE is_problem = 1 GROUP BY problem_reason ORDER BY count DESC`
    ).all() as any[];

    const clients = db.prepare(`SELECT client_id, client_name FROM clients_snapshot ORDER BY client_name`).all() as any[];

    return { inboxes, typeCounts, clients, lastSync: lastSync?.finished_at ?? null, synced: !!lastSync };
  } catch {
    return { inboxes: [], typeCounts: [], clients: [], lastSync: null, synced: false };
  }
}

export default async function InboxExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; problem_type?: string }>;
}) {
  const sp = await searchParams;
  const data = await getInboxExceptions(sp.client_id, sp.problem_type);

  return (
    <>
      <Topbar
        title={`Inbox Exceptions (${data.inboxes.length})`}
        subtitle="Only showing problem inboxes — not all inboxes"
      />
      <div className="page-body">
        <InboxExceptionsTable data={data} />
      </div>
    </>
  );
}
