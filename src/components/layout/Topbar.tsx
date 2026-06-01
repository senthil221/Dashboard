'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface SyncState {
  isRunning: boolean;
  lastSync: string | null;
}

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const [syncState, setSyncState] = useState<SyncState>({ isRunning: false, lastSync: null });
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    checkSyncStatus();
  }, []);

  async function checkSyncStatus() {
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const data = await res.json();
        setSyncState(data);
      }
    } catch {}
  }

  async function triggerSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!data.success) setSyncError(data.error ?? 'Sync failed');
      else {
        setSyncState({ isRunning: false, lastSync: new Date().toISOString() });
        window.location.reload();
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const lastSyncText = syncState.lastSync
    ? `Synced ${format(new Date(syncState.lastSync), 'MMM d, h:mm a')}`
    : 'Never synced';

  return (
    <div className="topbar">
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>

      {syncError && (
        <div style={{
          background: 'var(--severity-critical-bg)', border: '1px solid var(--severity-critical)',
          color: 'var(--severity-critical)', padding: '4px 10px', borderRadius: 5, fontSize: 12,
        }}>
          Sync error: {syncError}
        </div>
      )}

      <div className="sync-bar">
        {syncing ? (
          <>
            <div className="spinner" />
            <span>Syncing…</span>
          </>
        ) : (
          <>
            {syncState.lastSync && <div className="pulse-dot" />}
            <span>{lastSyncText}</span>
          </>
        )}
      </div>

      <button
        className="btn btn-secondary"
        onClick={triggerSync}
        disabled={syncing}
        style={{ fontSize: 12, padding: '5px 12px' }}
      >
        {syncing ? (
          <><div className="spinner" style={{ width: 12, height: 12 }} /> Syncing</>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 8a6 6 0 1 1 1.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M2 4.5V8h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sync Now
          </>
        )}
      </button>
    </div>
  );
}
