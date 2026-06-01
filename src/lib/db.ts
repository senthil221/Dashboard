import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), 'data', 'dashboard.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    -- Sync metadata
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error TEXT,
      records_synced INTEGER DEFAULT 0
    );

    -- Clients
    CREATE TABLE IF NOT EXISTS clients_snapshot (
      client_id INTEGER PRIMARY KEY,
      client_name TEXT NOT NULL,
      email TEXT,
      synced_at TEXT NOT NULL
    );

    -- Campaigns
    CREATE TABLE IF NOT EXISTS campaigns_snapshot (
      campaign_id INTEGER PRIMARY KEY,
      client_id INTEGER,
      campaign_name TEXT NOT NULL,
      status TEXT NOT NULL,
      tags TEXT,
      max_leads_per_day INTEGER,
      synced_at TEXT NOT NULL
    );

    -- Per-campaign analytics aggregated by period
    CREATE TABLE IF NOT EXISTS campaigns_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      campaign_id INTEGER NOT NULL,
      client_id INTEGER,
      sent INTEGER NOT NULL DEFAULT 0,
      replies INTEGER NOT NULL DEFAULT 0,
      positive_replies INTEGER,
      bounces INTEGER NOT NULL DEFAULT 0,
      reply_rate REAL NOT NULL DEFAULT 0,
      positive_reply_rate REAL,
      bounce_rate REAL NOT NULL DEFAULT 0,
      status_label TEXT,
      recommended_action TEXT,
      synced_at TEXT NOT NULL,
      UNIQUE(date, campaign_id)
    );

    -- Domain-level daily aggregations
    CREATE TABLE IF NOT EXISTS domains_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      client_id INTEGER,
      client_name TEXT,
      domain TEXT NOT NULL,
      provider TEXT,
      inbox_count INTEGER NOT NULL DEFAULT 0,
      active_inbox_count INTEGER NOT NULL DEFAULT 0,
      disconnected_inbox_count INTEGER NOT NULL DEFAULT 0,
      warmup_active_count INTEGER NOT NULL DEFAULT 0,
      warmup_inactive_count INTEGER NOT NULL DEFAULT 0,
      avg_warmup_reputation REAL,
      sent INTEGER NOT NULL DEFAULT 0,
      replies INTEGER NOT NULL DEFAULT 0,
      positive_replies INTEGER,
      bounces INTEGER NOT NULL DEFAULT 0,
      reply_rate REAL NOT NULL DEFAULT 0,
      positive_reply_rate REAL,
      bounce_rate REAL NOT NULL DEFAULT 0,
      campaign_count INTEGER NOT NULL DEFAULT 0,
      last_reply_date TEXT,
      status TEXT NOT NULL DEFAULT 'Healthy',
      recommended_action TEXT,
      synced_at TEXT NOT NULL,
      UNIQUE(date, domain, COALESCE(client_id, -1))
    );

    -- Inbox snapshots (for exception detection)
    CREATE TABLE IF NOT EXISTS inboxes_snapshot (
      email_account_id INTEGER PRIMARY KEY,
      email TEXT NOT NULL,
      domain TEXT NOT NULL,
      client_id INTEGER,
      provider TEXT,
      smtp_status INTEGER NOT NULL DEFAULT 1,
      imap_status INTEGER NOT NULL DEFAULT 1,
      warmup_status INTEGER NOT NULL DEFAULT 0,
      warmup_reputation REAL,
      daily_sent_count INTEGER NOT NULL DEFAULT 0,
      max_email_per_day INTEGER NOT NULL DEFAULT 0,
      is_problem INTEGER NOT NULL DEFAULT 0,
      problem_reason TEXT,
      synced_at TEXT NOT NULL
    );

    -- Warmup stats cache (avoids calling per-inbox endpoint repeatedly)
    CREATE TABLE IF NOT EXISTS warmup_stats_cache (
      email_account_id INTEGER PRIMARY KEY,
      warmup_reputation REAL NOT NULL DEFAULT 0,
      total_sent_count INTEGER NOT NULL DEFAULT 0,
      total_spam_count INTEGER NOT NULL DEFAULT 0,
      inbox_placement_rate REAL NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL
    );

    -- Alerts
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      object_type TEXT NOT NULL CHECK(object_type IN ('Client', 'Campaign', 'Domain', 'Inbox')),
      object_id TEXT,
      object_name TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('Critical', 'High', 'Medium', 'Low')),
      issue TEXT NOT NULL,
      recommended_action TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'resolved', 'snoozed')),
      first_detected_at TEXT NOT NULL,
      last_updated_at TEXT NOT NULL
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_campaigns_daily_campaign ON campaigns_daily(campaign_id, date);
    CREATE INDEX IF NOT EXISTS idx_campaigns_daily_client ON campaigns_daily(client_id, date);
    CREATE INDEX IF NOT EXISTS idx_domains_daily_domain ON domains_daily(domain, date);
    CREATE INDEX IF NOT EXISTS idx_domains_daily_client ON domains_daily(client_id, date);
    CREATE INDEX IF NOT EXISTS idx_inboxes_domain ON inboxes_snapshot(domain);
    CREATE INDEX IF NOT EXISTS idx_inboxes_client ON inboxes_snapshot(client_id);
    CREATE INDEX IF NOT EXISTS idx_inboxes_problem ON inboxes_snapshot(is_problem);
    CREATE INDEX IF NOT EXISTS idx_alerts_client ON alerts(client_id, status);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
  `);
}

// ─── Sync log helpers ─────────────────────────────────────────────────────────

export function startSyncLog(db: Database.Database, syncType: string): number {
  const result = db.prepare(
    `INSERT INTO sync_log (sync_type, status, started_at) VALUES (?, 'running', datetime('now'))`
  ).run(syncType);
  return result.lastInsertRowid as number;
}

export function completeSyncLog(db: Database.Database, id: number, records: number) {
  db.prepare(
    `UPDATE sync_log SET status = 'completed', finished_at = datetime('now'), records_synced = ? WHERE id = ?`
  ).run(records, id);
}

export function failSyncLog(db: Database.Database, id: number, error: string) {
  db.prepare(
    `UPDATE sync_log SET status = 'failed', finished_at = datetime('now'), error = ? WHERE id = ?`
  ).run(error, id);
}

export function getLastSync(db: Database.Database, syncType: string) {
  return db.prepare(
    `SELECT * FROM sync_log WHERE sync_type = ? AND status = 'completed' ORDER BY finished_at DESC LIMIT 1`
  ).get(syncType) as { finished_at: string; records_synced: number } | undefined;
}
