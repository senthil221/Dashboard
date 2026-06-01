'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface InboxRow {
  email_account_id: number;
  email: string;
  domain: string;
  client_name?: string;
  provider?: string;
  smtp_status: number;
  imap_status: number;
  warmup_status: number;
  daily_sent_count: number;
  max_email_per_day: number;
  problem_reason: string;
  synced_at: string;
}

interface Props {
  data: {
    inboxes: InboxRow[];
    typeCounts: { problem_reason: string; count: number }[];
    clients: { client_id: number; client_name: string }[];
    lastSync: string | null;
    synced: boolean;
  };
}

const PROBLEM_COLORS: Record<string, string> = {
  'SMTP failed': 'var(--status-risk)',
  'IMAP failed': 'var(--status-risk)',
  'Suspended': 'var(--status-disconnected)',
  'Inactive': 'var(--status-burned)',
  'Warmup inactive': 'var(--status-watch)',
};

export function InboxExceptionsTable({ data }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentClient = searchParams.get('client_id') ?? '';
  const currentType = searchParams.get('problem_type') ?? '';

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  if (!data.synced) {
    return (
      <div className="state-empty" style={{ marginTop: 40 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>No data yet</div>
        <div>Click <strong>Sync Now</strong> to detect inbox issues.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Problem type breakdown */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {data.typeCounts.map(tc => (
          <button
            key={tc.problem_reason}
            onClick={() => updateFilter('problem_type', currentType === tc.problem_reason ? '' : tc.problem_reason)}
            style={{
              padding: '4px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${currentType === tc.problem_reason ? 'var(--accent)' : 'var(--bg-border)'}`,
              background: currentType === tc.problem_reason ? 'rgba(37,99,235,0.1)' : 'var(--bg-raised)',
              color: PROBLEM_COLORS[tc.problem_reason] ?? 'var(--text-secondary)',
              fontFamily: 'inherit',
            }}
          >
            {tc.problem_reason}{' '}
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{tc.count}</span>
          </button>
        ))}

        <select className="filter-select" value={currentClient} onChange={e => updateFilter('client_id', e.target.value)}>
          <option value="">All Clients</option>
          {data.clients.map(c => <option key={c.client_id} value={c.client_id}>{c.client_name}</option>)}
        </select>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          {data.inboxes.length} problem inbox{data.inboxes.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {data.inboxes.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8,
          padding: '40px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--status-healthy)', marginBottom: 6 }}>
            No problems detected
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            All inboxes are healthy based on last sync.
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Domain</th>
                <th>Client</th>
                <th>Problem</th>
                <th>Provider</th>
                <th>SMTP</th>
                <th>IMAP</th>
                <th>Warmup</th>
                <th>Sent Today</th>
                <th>Max/Day</th>
              </tr>
            </thead>
            <tbody>
              {data.inboxes.map(inbox => (
                <tr key={inbox.email_account_id} className="row-risk">
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{inbox.email}</td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {inbox.domain}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    {inbox.client_name ?? '—'}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{ background: 'rgba(239,68,68,0.1)', color: PROBLEM_COLORS[inbox.problem_reason] ?? 'var(--status-risk)' }}
                    >
                      {inbox.problem_reason}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {inbox.provider ?? '—'}
                  </td>
                  <td>
                    {inbox.smtp_status
                      ? <span style={{ color: 'var(--status-healthy)', fontSize: 13 }}>✓</span>
                      : <span style={{ color: 'var(--status-risk)', fontSize: 13, fontWeight: 700 }}>✗</span>}
                  </td>
                  <td>
                    {inbox.imap_status
                      ? <span style={{ color: 'var(--status-healthy)', fontSize: 13 }}>✓</span>
                      : <span style={{ color: 'var(--status-risk)', fontSize: 13, fontWeight: 700 }}>✗</span>}
                  </td>
                  <td>
                    {inbox.warmup_status
                      ? <span style={{ color: 'var(--status-healthy)', fontSize: 12 }}>On</span>
                      : <span style={{ color: 'var(--status-watch)', fontSize: 12 }}>Off</span>}
                  </td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                    {inbox.daily_sent_count}
                  </td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                    {inbox.max_email_per_day}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
