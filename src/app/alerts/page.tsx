import { Topbar } from '@/components/layout/Topbar';
import { AlertsTable } from '@/components/alerts/AlertsTable';

export const dynamic = 'force-dynamic';

async function getAlertsData(clientId?: string, severity?: string) {
  try {
    const { getDb, getLastSync } = await import('@/lib/db');
    const db = getDb();
    const lastSync = getLastSync(db, 'full');

    let query = `
      SELECT a.*, c.client_name
      FROM alerts a
      LEFT JOIN clients_snapshot c ON a.client_id = c.client_id
      WHERE a.status = 'active'
    `;
    const params: (string | number)[] = [];

    if (clientId) { query += ` AND a.client_id = ?`; params.push(parseInt(clientId)); }
    if (severity) { query += ` AND a.severity = ?`; params.push(severity); }

    query += ` ORDER BY
      CASE a.severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
      a.last_updated_at DESC`;

    const alerts = db.prepare(query).all(...params) as any[];

    const counts = db.prepare(
      `SELECT severity, COUNT(*) as count FROM alerts WHERE status = 'active' GROUP BY severity`
    ).all() as any[];

    const clients = db.prepare(`SELECT client_id, client_name FROM clients_snapshot ORDER BY client_name`).all() as any[];

    return { alerts, counts, clients, lastSync: lastSync?.finished_at ?? null, synced: !!lastSync };
  } catch {
    return { alerts: [], counts: [], clients: [], lastSync: null, synced: false };
  }
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; severity?: string }>;
}) {
  const sp = await searchParams;
  const data = await getAlertsData(sp.client_id, sp.severity);

  const totalActive = data.counts.reduce((sum: number, c: any) => sum + c.count, 0);
  const criticalCount = (data.counts.find((c: any) => c.severity === 'Critical')?.count ?? 0);

  return (
    <>
      <Topbar
        title={`Alerts ${totalActive > 0 ? `(${totalActive})` : ''}`}
        subtitle={criticalCount > 0 ? `⚠ ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} requiring immediate attention` : 'No critical alerts'}
      />
      <div className="page-body">
        <AlertsTable data={data} />
      </div>
    </>
  );
}
