import { Topbar } from '@/components/layout/Topbar';
import { InboxExceptionsTable } from '@/components/inboxes/InboxExceptionsTable';
import { getSmartleadClient } from '@/lib/smartlead/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function getInboxExceptions(clientId?: string, problemType?: string) {
  try {
    const sl = getSmartleadClient();

    const [allInboxes, clients] = await Promise.all([
      sl.listAllEmailAccounts().catch(() => []),
      sl.listClients().catch(() => []),
    ]);

    const clientMap = new Map(clients.map(c => [c.id, c.name]));

    const enriched = allInboxes.map(inbox => {
      const domain = inbox.email.split('@')[1] ?? 'unknown';
      const smtpOk = inbox.is_smtp_success !== false ? 1 : 0;
      const imapOk = inbox.is_imap_success !== false ? 1 : 0;
      const warmupOn = inbox.warmup_enabled ? 1 : 0;

      let isProblem = 0;
      let problemReason: string | null = null;

      if (!smtpOk) { isProblem = 1; problemReason = 'SMTP failed'; }
      else if (!imapOk) { isProblem = 1; problemReason = 'IMAP failed'; }
      else if (inbox.status === 'SUSPENDED') { isProblem = 1; problemReason = 'Suspended'; }
      else if (inbox.status === 'INACTIVE') { isProblem = 1; problemReason = 'Inactive'; }
      else if (!inbox.warmup_enabled) { isProblem = 1; problemReason = 'Warmup inactive'; }

      return {
        email_account_id: inbox.id,
        email: inbox.email,
        domain,
        client_id: inbox.client_id ?? null,
        client_name: inbox.client_id ? (clientMap.get(inbox.client_id) ?? undefined) : undefined,
        smtp_status: smtpOk,
        imap_status: imapOk,
        warmup_status: warmupOn,
        daily_sent_count: inbox.message_count ?? 0,
        max_email_per_day: inbox.max_email_per_day ?? 0,
        is_problem: isProblem,
        problem_reason: problemReason ?? 'Unknown',
        synced_at: new Date().toISOString(),
      };
    });

    let problems = enriched.filter(i => i.is_problem === 1);

    if (clientId) {
      const cid = parseInt(clientId, 10);
      problems = problems.filter(i => i.client_id === cid);
    }
    if (problemType) {
      problems = problems.filter(i => i.problem_reason === problemType);
    }

    problems.sort((a, b) => {
      const ra = a.problem_reason ?? '';
      const rb = b.problem_reason ?? '';
      if (ra !== rb) return ra.localeCompare(rb);
      if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
      return a.email.localeCompare(b.email);
    });

    // Counts grouped by problem type (unfiltered by type, but filtered by client)
    const allProblemsForClient = clientId
      ? enriched.filter(i => i.is_problem === 1 && i.client_id === parseInt(clientId, 10))
      : enriched.filter(i => i.is_problem === 1);

    const typeCountMap = new Map<string, number>();
    for (const p of allProblemsForClient) {
      const key = p.problem_reason ?? 'Unknown';
      typeCountMap.set(key, (typeCountMap.get(key) ?? 0) + 1);
    }
    const typeCounts = [...typeCountMap.entries()]
      .map(([problem_reason, count]) => ({ problem_reason, count }))
      .sort((a, b) => b.count - a.count);

    return {
      inboxes: problems,
      typeCounts,
      clients: clients.map(c => ({ client_id: c.id, client_name: c.name })),
      lastSync: new Date().toISOString(),
      synced: true,
    };
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
