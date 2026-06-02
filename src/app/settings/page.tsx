import { Topbar } from '@/components/layout/Topbar';
import { THRESHOLDS } from '@/lib/thresholds';
import { getSmartleadClient } from '@/lib/smartlead/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function getSettingsData() {
  try {
    const sl = getSmartleadClient();

    const [clients, campaigns] = await Promise.all([
      sl.listClients().catch(() => []),
      sl.listCampaigns().catch(() => []),
    ]);

    return {
      stats: {
        clients: clients.length,
        campaigns: campaigns.length,
        activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
      },
    };
  } catch {
    return { stats: { clients: 0, campaigns: 0, activeCampaigns: 0 } };
  }
}

export default async function SettingsPage() {
  const { stats } = await getSettingsData();
  const apiKeySet = !!process.env.SMARTLEAD_API_KEY;

  return (
    <>
      <Topbar title="Settings" subtitle="Configuration and live data mode" />
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
                  ? 'SMARTLEAD_API_KEY is set — data is fetched live from Smartlead on every request'
                  : 'Set SMARTLEAD_API_KEY in your environment variables to connect to Smartlead'}
              </span>
            </div>
          </section>

          {/* Live mode info */}
          <section style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 8, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Live Data Mode</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Clients', value: stats.clients },
                { label: 'Campaigns', value: stats.campaigns },
                { label: 'Active Campaigns', value: stats.activeCampaigns },
              ].map(s => (
                <div key={s.label} className="stat-card" style={{ padding: '12px 14px' }}>
                  <div className="label">{s.label}</div>
                  <div className="value font-mono" style={{ fontSize: 18 }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              All dashboard data is fetched directly from the Smartlead API on every page load.
              No local database is used. Use the <strong>Refresh</strong> button in the top bar to reload fresh data.
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

        </div>
      </div>
    </>
  );
}

function camelToLabel(str: string) {
  return str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}
