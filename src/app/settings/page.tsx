import { Topbar } from '@/components/layout/Topbar';
import { THRESHOLDS } from '@/lib/thresholds';

export const dynamic = 'force-dynamic';

async function getSettingsData() {
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();

    const syncHistory = db.prepare(
      `SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 10`
    ).all() as any[];

    const stats = {
      clients: (db.prepare(`SELECT COUNT(*) as n FROM clients_snapshot`).get() as any)?.n ?? 0,
      campaigns: (db.prepare(`SELECT COUNT(*) as n FROM campaigns_snapshot`).get() as any)?.n ?? 0,
      inboxes: (db.prepare(`SELECT COUNT(*) as n FROM inboxes_snapshot`).get() as any)?.n ?? 0,
      domains: (db.prepare(`SELECT COUNT(DISTINCT domain) as n FROM inboxes_snapshot`).get() as any)?.n ?? 0,
      alerts: (db.prepare(`SELECT COUNT(*) as n FROM alerts WHERE status = 'active'`).get() as any)?.n ?? 0,
    };

    return { syncHistory, stats };
  } catch {
    return { syncHistory: [], stats: { clients: 0, campaigns: 0, inboxes: 0, domains: 0, alerts: 0 } };
  }
}

export default async function SettingsPage() {
  const { syncHistory, stats } = await getSettingsData();

  const apiKeySet = !!process.env.SMARTLEAD_API_KEY;

  return (
    <>
      <Topbar title="Settings" subtitle="Configuration and sync history" />
      <div className="page-body">
        <div style={{ maxWidth: 800, display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* API Key status */}
          <section style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>API Configuration</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={`badge ${apiKeySet ? 'badge-healthy' : 'badge-risk'}`}>
                {apiKeySet ? '● Connected' : '● Not configured'}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                {apiKeySet
                  ? 'SMARTLEAD_API_KEY is set in environment variables'
                  : 'Set SMARTLEAD_API_KEY in .env.local to connect to Smartlead'}
              </span>
            </div>
          </section>

          {/* Database stats */}
          <section style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Database</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
              {[
                { label: 'Clients', value: stats.clients },
                { label: 'Campaigns', value: stats.campaigns },
                { label: 'Inboxes', value: stats.inboxes.toLocaleString() },
                { label: 'Domains', value: stats.domains },
                { label: 'Active Alerts', value: stats.alerts },
              ].map(s => (
                <div key={s.label} className="stat-card" style={{ padding: '12px 14px' }}>
                  <div className="label">{s.label}</div>
                  <div className="value font-mono" style={{ fontSize: 18 }}>{s.value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Thresholds */}
          <section style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Status Thresholds</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Edit <code style={{ background: 'var(--bg-raised)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>src/lib/thresholds.ts</code> to change these values.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {Object.entries(THRESHOLDS).map(([key, value]) => (
                <div key={key} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', background: 'var(--bg-raised)', borderRadius: 5,
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{camelToLabel(key)}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Sync history */}
          <section style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Sync History (last 10)</div>
            {syncHistory.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No syncs recorded yet.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Finished</th>
                    <th>Records</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {syncHistory.map((s: any) => (
                    <tr key={s.id}>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{s.sync_type}</td>
                      <td>
                        <span className={`badge ${s.status === 'completed' ? 'badge-healthy' : s.status === 'failed' ? 'badge-risk' : 'badge-watch'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.started_at}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.finished_at ?? '—'}</td>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                        {s.records_synced?.toLocaleString() ?? '—'}
                      </td>
                      <td style={{ maxWidth: 200, fontSize: 11.5, color: 'var(--status-risk)' }}>
                        {s.error ? s.error.slice(0, 80) + (s.error.length > 80 ? '…' : '') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

        </div>
      </div>
    </>
  );
}

function camelToLabel(str: string) {
  return str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}
