import { Topbar } from '@/components/layout/Topbar';
import { DomainsTable } from '@/components/domains/DomainsTable';

export const dynamic = 'force-dynamic';

async function getDomainsData(clientId?: string, status?: string) {
  try {
    const { getDb, getLastSync } = await import('@/lib/db');
    const db = getDb();
    const dateToday = new Date().toISOString().split('T')[0];
    const lastSync = getLastSync(db, 'full');

    let query = `
      SELECT dd.*,
             c.client_name,
             COALESCE(ins.inbox_count, dd.inbox_count, 0) as inbox_count,
             COALESCE(ins.active_count, dd.active_inbox_count, 0) as active_inbox_count,
             COALESCE(ins.disc_count, dd.disconnected_inbox_count, 0) as disconnected_inbox_count,
             COALESCE(ins.warmup_active, dd.warmup_active_count, 0) as warmup_active_count,
             COALESCE(ins.warmup_inactive, dd.warmup_inactive_count, 0) as warmup_inactive_count,
             wc.avg_rep as avg_warmup_reputation
      FROM domains_daily dd
      LEFT JOIN clients_snapshot c ON dd.client_id = c.client_id
      LEFT JOIN (
        SELECT domain, COUNT(*) as inbox_count,
               SUM(CASE WHEN smtp_status=1 AND imap_status=1 THEN 1 ELSE 0 END) as active_count,
               SUM(CASE WHEN smtp_status=0 OR imap_status=0 THEN 1 ELSE 0 END) as disc_count,
               SUM(warmup_status) as warmup_active,
               SUM(CASE WHEN warmup_status=0 THEN 1 ELSE 0 END) as warmup_inactive
        FROM inboxes_snapshot GROUP BY domain
      ) ins ON dd.domain = ins.domain
      LEFT JOIN (
        SELECT ins2.domain, AVG(wsc.warmup_reputation) as avg_rep
        FROM warmup_stats_cache wsc
        JOIN inboxes_snapshot ins2 ON wsc.email_account_id = ins2.email_account_id
        GROUP BY ins2.domain
      ) wc ON dd.domain = wc.domain
      WHERE dd.date = ?
    `;
    const params: (string | number)[] = [dateToday];

    if (clientId) { query += ` AND dd.client_id = ?`; params.push(parseInt(clientId)); }
    if (status) { query += ` AND dd.status = ?`; params.push(status); }

    query += ` ORDER BY
      CASE dd.status WHEN 'Burned' THEN 1 WHEN 'Risk' THEN 2 WHEN 'Watch' THEN 3 ELSE 4 END,
      dd.bounce_rate DESC, dd.sent DESC`;

    const domains = db.prepare(query).all(...params) as any[];

    const clients = db.prepare(`SELECT client_id, client_name FROM clients_snapshot ORDER BY client_name`).all() as any[];

    return { domains, clients, lastSync: lastSync?.finished_at ?? null, synced: !!lastSync };
  } catch {
    return { domains: [], clients: [], lastSync: null, synced: false };
  }
}

export default async function DomainsPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const data = await getDomainsData(sp.client_id, sp.status);

  return (
    <>
      <Topbar title="Domain Health" subtitle={`${data.domains.length} domains · last 7 days`} />
      <div className="page-body">
        <DomainsTable data={data} />
      </div>
    </>
  );
}
