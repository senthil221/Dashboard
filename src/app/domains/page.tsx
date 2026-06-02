import { Topbar } from '@/components/layout/Topbar';
import { DomainsTable } from '@/components/domains/DomainsTable';
import { getSmartleadClient } from '@/lib/smartlead/client';
import { getDomainStatus } from '@/lib/thresholds';
import { today, daysAgo, domainAction } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getDomainsData(clientId?: string, status?: string) {
  try {
    const sl = getSmartleadClient();
    const end = today();
    const start7 = daysAgo(7);
    const cid = clientId ? parseInt(clientId, 10) : undefined;

    const [domainMetrics, clients] = await Promise.all([
      sl.getDomainHealthMetrics(start7, end, cid),
      sl.listClients().catch(() => []),
    ]);

    const clientMap = new Map(clients.map(c => [c.id, c.name]));
    const clientName = cid ? (clientMap.get(cid) ?? undefined) : undefined;

    const rows = domainMetrics
      .map(d => {
        const ds = getDomainStatus(d.bounce_rate, d.reply_rate, 0, 0, d.sent_count);
        return {
          domain: d.domain,
          client_id: cid ?? undefined,
          client_name: clientName,
          status: ds,
          inbox_count: d.inbox_count ?? 0,
          active_inbox_count: 0,
          disconnected_inbox_count: 0,
          warmup_active_count: 0,
          warmup_inactive_count: 0,
          avg_warmup_reputation: null as number | null,
          sent: d.sent_count,
          replies: d.reply_count,
          bounces: d.bounce_count,
          reply_rate: d.reply_rate,
          bounce_rate: d.bounce_rate,
          recommended_action: domainAction(ds, d.bounce_rate),
        };
      })
      .filter(d => !status || d.status === status)
      .sort((a, b) => {
        const ord = (s: string) => s === 'Burned' ? 0 : s === 'Risk' ? 1 : s === 'Watch' ? 2 : 3;
        const d = ord(a.status) - ord(b.status);
        return d !== 0 ? d : b.bounce_rate - a.bounce_rate || b.sent - a.sent;
      });

    return {
      domains: rows,
      clients: clients.map(c => ({ client_id: c.id, client_name: c.name })),
      lastSync: new Date().toISOString(),
      synced: true,
    };
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
