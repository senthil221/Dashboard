import Database from 'better-sqlite3';
import { getDb, startSyncLog, completeSyncLog, failSyncLog } from '@/lib/db';
import { getSmartleadClient, SmartleadAPIError, SmartleadValidationError } from '@/lib/smartlead/client';
import { format, subDays } from 'date-fns';
import {
  getCampaignStatusLabel,
  getDomainStatus,
  getClientStatus,
  THRESHOLDS,
} from '@/lib/thresholds';

// Date helpers
function today(): string {
  return format(new Date(), 'yyyy-MM-dd');
}
function daysAgo(n: number): string {
  return format(subDays(new Date(), n), 'yyyy-MM-dd');
}

export interface SyncResult {
  success: boolean;
  error?: string;
  recordsSynced: number;
  warnings: string[];
}

// ─── Main sync orchestrator ────────────────────────────────────────────────────

export async function runFullSync(options?: {
  skipInboxes?: boolean;
  skipWarmupStats?: boolean;
}): Promise<SyncResult> {
  const db = getDb();
  const client = getSmartleadClient();
  const warnings: string[] = [];
  let totalRecords = 0;

  const logId = startSyncLog(db, 'full');
  try {
    const start7 = daysAgo(7);
    const end = today();
    const start14 = daysAgo(14);

    // 1. Sync clients
    console.log('[Sync] Fetching clients...');
    const clients = await client.listClients();
    const upsertClient = db.prepare(
      `INSERT OR REPLACE INTO clients_snapshot (client_id, client_name, email, synced_at)
       VALUES (?, ?, ?, datetime('now'))`
    );
    const insertClients = db.transaction(() => {
      for (const c of clients) {
        upsertClient.run(c.id, c.name, c.email ?? '');
      }
    });
    insertClients();
    totalRecords += clients.length;
    console.log(`[Sync] ${clients.length} clients synced`);

    // 2. Sync campaigns for each client
    console.log('[Sync] Fetching campaigns...');
    const allCampaigns = await client.listCampaigns();
    const upsertCampaign = db.prepare(
      `INSERT OR REPLACE INTO campaigns_snapshot
       (campaign_id, client_id, campaign_name, status, tags, max_leads_per_day, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const insertCampaigns = db.transaction(() => {
      for (const c of allCampaigns) {
        upsertCampaign.run(
          c.id, c.client_id ?? null, c.name, c.status,
          c.tags ? JSON.stringify(c.tags) : null,
          c.max_leads_per_day ?? null
        );
      }
    });
    insertCampaigns();
    totalRecords += allCampaigns.length;
    console.log(`[Sync] ${allCampaigns.length} campaigns synced`);

    // 3. Sync campaign overall stats (last 7 days and previous 7 days)
    console.log('[Sync] Fetching campaign overall stats...');
    let overallStats7: Awaited<ReturnType<typeof client.getCampaignOverallStats>> = [];
    let overallStats14: Awaited<ReturnType<typeof client.getCampaignOverallStats>> = [];
    let responseStats: Awaited<ReturnType<typeof client.getCampaignResponseStats>> = [];

    try {
      overallStats7 = await client.getCampaignOverallStats(start7, end);
    } catch (e) {
      warnings.push(`Campaign overall stats (7d) failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      overallStats14 = await client.getCampaignOverallStats(start14, daysAgo(7));
    } catch (e) {
      warnings.push(`Campaign overall stats (prev 7d) failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      responseStats = await client.getCampaignResponseStats(start7, end);
    } catch (e) {
      warnings.push(`Campaign response stats failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Build response stats lookup by campaign_id
    const responseMap = new Map(responseStats.map(r => [r.campaign_id, r]));

    // Upsert campaign daily records
    const upsertCampaignDaily = db.prepare(
      `INSERT OR REPLACE INTO campaigns_daily
       (date, campaign_id, client_id, sent, replies, positive_replies, bounces,
        reply_rate, positive_reply_rate, bounce_rate, status_label, recommended_action, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );

    const insertDailyCampaigns = db.transaction(() => {
      for (const stat of overallStats7) {
        const resp = responseMap.get(stat.campaign_id);
        const positiveReplies = resp?.interested_count ?? null;
        const positiveReplyRate = stat.sent_count > 0 && positiveReplies !== null
          ? (positiveReplies / stat.sent_count) * 100
          : null;

        const campaign = allCampaigns.find(c => c.id === stat.campaign_id);
        const statusLabel = getCampaignStatusLabel(
          stat.sent_count, stat.reply_rate, stat.bounce_rate, positiveReplyRate
        );

        const action = getRecommendedCampaignAction(statusLabel);

        upsertCampaignDaily.run(
          end, stat.campaign_id, stat.client_id ?? campaign?.client_id ?? null,
          stat.sent_count, stat.reply_count, positiveReplies,
          stat.bounce_count, stat.reply_rate, positiveReplyRate,
          stat.bounce_rate, statusLabel, action
        );
      }
    });
    insertDailyCampaigns();
    totalRecords += overallStats7.length;
    console.log(`[Sync] ${overallStats7.length} campaign daily records synced`);

    // 4. Sync domain health metrics (last 7 days + previous 7 days)
    console.log('[Sync] Fetching domain health metrics...');
    let domainMetrics7: Awaited<ReturnType<typeof client.getDomainHealthMetrics>> = [];
    let domainMetrics14: Awaited<ReturnType<typeof client.getDomainHealthMetrics>> = [];

    try {
      domainMetrics7 = await client.getDomainHealthMetrics(start7, end);
    } catch (e) {
      warnings.push(`Domain health (7d) failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      domainMetrics14 = await client.getDomainHealthMetrics(start14, daysAgo(7));
    } catch (e) {
      warnings.push(`Domain health (prev 7d) failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Store domain metrics; we'll enrich with inbox counts after inbox sync
    const domainMetrics14Map = new Map(domainMetrics14.map(d => [d.domain, d]));

    const upsertDomainDaily = db.prepare(
      `INSERT OR REPLACE INTO domains_daily
       (date, client_id, client_name, domain, sent, replies, bounces,
        reply_rate, bounce_rate, status, recommended_action, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );

    const insertDomains = db.transaction(() => {
      for (const d of domainMetrics7) {
        const status = getDomainStatus(d.bounce_rate, d.reply_rate, 0, 0, d.sent_count);
        const action = getRecommendedDomainAction(status, d.bounce_rate, d.reply_rate, d.sent_count);
        upsertDomainDaily.run(
          end, null, null, d.domain,
          d.sent_count, d.reply_count, d.bounce_count,
          d.reply_rate, d.bounce_rate, status, action
        );
      }
    });
    insertDomains();
    totalRecords += domainMetrics7.length;
    console.log(`[Sync] ${domainMetrics7.length} domain records synced`);

    // 5. Sync email accounts (inboxes) — paginated
    if (!options?.skipInboxes) {
      console.log('[Sync] Fetching email accounts (paginated)...');
      let inboxCount = 0;

      try {
        const inboxes = await client.listAllEmailAccounts((fetched, total) => {
          console.log(`[Sync] Inboxes: ${fetched}/${total}`);
        });

        const upsertInbox = db.prepare(
          `INSERT OR REPLACE INTO inboxes_snapshot
           (email_account_id, email, domain, client_id, provider, smtp_status, imap_status,
            warmup_status, daily_sent_count, max_email_per_day, is_problem, problem_reason, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        );

        const domainInboxMap = new Map<string, {
          total: number; active: number; disconnected: number;
          warmupActive: number; warmupInactive: number;
        }>();

        const insertInboxes = db.transaction(() => {
          for (const inbox of inboxes) {
            const domain = inbox.email.split('@')[1] ?? 'unknown';
            const smtpOk = inbox.is_smtp_success !== false ? 1 : 0;
            const imapOk = inbox.is_imap_success !== false ? 1 : 0;
            const warmupOn = inbox.warmup_enabled ? 1 : 0;
            const active = inbox.status === 'ACTIVE' || inbox.status == null;
            const disconnected = !smtpOk || !imapOk || inbox.status === 'SUSPENDED' || inbox.status === 'INACTIVE';

            const provider = guessProvider(inbox.smtp_host ?? '');

            // Determine problem status
            let isProblem = 0;
            let problemReason: string | null = null;

            if (!smtpOk) { isProblem = 1; problemReason = 'SMTP failed'; }
            else if (!imapOk) { isProblem = 1; problemReason = 'IMAP failed'; }
            else if (inbox.status === 'SUSPENDED') { isProblem = 1; problemReason = 'Suspended'; }
            else if (inbox.status === 'INACTIVE') { isProblem = 1; problemReason = 'Inactive'; }
            else if (!inbox.warmup_enabled) { isProblem = 1; problemReason = 'Warmup inactive'; }

            upsertInbox.run(
              inbox.id, inbox.email, domain, inbox.client_id ?? null,
              provider, smtpOk, imapOk, warmupOn,
              inbox.message_count ?? 0, inbox.max_email_per_day ?? 0,
              isProblem, problemReason
            );

            // Accumulate domain stats
            if (!domainInboxMap.has(domain)) {
              domainInboxMap.set(domain, { total: 0, active: 0, disconnected: 0, warmupActive: 0, warmupInactive: 0 });
            }
            const ds = domainInboxMap.get(domain)!;
            ds.total++;
            if (active) ds.active++;
            if (disconnected) ds.disconnected++;
            if (inbox.warmup_enabled) ds.warmupActive++;
            else ds.warmupInactive++;
          }
        });
        insertInboxes();
        inboxCount = inboxes.length;

        // Update domain_daily with inbox counts
        const updateDomainInboxCounts = db.prepare(
          `UPDATE domains_daily
           SET inbox_count = ?, active_inbox_count = ?, disconnected_inbox_count = ?,
               warmup_active_count = ?, warmup_inactive_count = ?
           WHERE date = ? AND domain = ?`
        );
        const updateDomains = db.transaction(() => {
          for (const [domain, stats] of domainInboxMap) {
            updateDomainInboxCounts.run(
              stats.total, stats.active, stats.disconnected,
              stats.warmupActive, stats.warmupInactive,
              end, domain
            );
          }
        });
        updateDomains();

      } catch (e) {
        warnings.push(`Inbox sync failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      totalRecords += inboxCount;
      console.log(`[Sync] ${inboxCount} inboxes synced`);
    }

    // 6. Sync client overall stats
    console.log('[Sync] Fetching client overall stats...');
    try {
      const clientStats = await client.getClientOverallStats(start7, end);
      // Update domain records with client associations derived from domain analytics per client
      for (const stat of clientStats) {
        // Update campaigns to associate with client
        db.prepare(
          `UPDATE campaigns_daily SET client_id = ? WHERE campaign_id IN (
            SELECT campaign_id FROM campaigns_snapshot WHERE client_id = ?
          ) AND date = ?`
        ).run(stat.client_id, stat.client_id, end);
      }
    } catch (e) {
      warnings.push(`Client overall stats failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 7. Generate alerts
    console.log('[Sync] Generating alerts...');
    await generateAlerts(db);

    completeSyncLog(db, logId, totalRecords);
    console.log(`[Sync] Full sync complete. ${totalRecords} records, ${warnings.length} warnings.`);

    return { success: true, recordsSynced: totalRecords, warnings };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failSyncLog(db, logId, msg);
    console.error('[Sync] Full sync failed:', msg);
    return { success: false, error: msg, recordsSynced: totalRecords, warnings };
  }
}

// ─── Alert generation ──────────────────────────────────────────────────────────

async function generateAlerts(db: Database.Database) {
  const now = new Date().toISOString();
  const dateToday = today();
  const date7dAgo = daysAgo(7);

  const upsertAlert = db.prepare(
    `INSERT INTO alerts
     (client_id, object_type, object_id, object_name, alert_type, severity,
      issue, recommended_action, first_detected_at, last_updated_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM alerts
       WHERE object_type = ? AND object_id = ? AND alert_type = ? AND status = 'active'
     )`
  );

  const resolveAlert = db.prepare(
    `UPDATE alerts SET status = 'resolved', last_updated_at = ?
     WHERE object_type = ? AND alert_type = ? AND status = 'active'
     AND object_id NOT IN (
       SELECT DISTINCT CAST(domain AS TEXT) FROM domains_daily
       WHERE date = ? AND ${dateToday === dateToday ? '1=1' : '1=0'}
     )`
  );

  // Alert: domain bounce rate above threshold
  const highBounceDomains = db.prepare(
    `SELECT dd.*, c.client_name
     FROM domains_daily dd
     LEFT JOIN clients_snapshot c ON dd.client_id = c.client_id
     WHERE dd.date = ? AND dd.bounce_rate > ? AND dd.sent > ?`
  ).all(dateToday, THRESHOLDS.bounceRateWarning, THRESHOLDS.minSendsForJudgement) as any[];

  for (const d of highBounceDomains) {
    const severity = d.bounce_rate > THRESHOLDS.bounceRateCritical ? 'Critical' : 'High';
    upsertAlert.run(
      d.client_id, 'Domain', d.domain, d.domain,
      'domain_high_bounce_rate', severity,
      `Bounce rate ${d.bounce_rate.toFixed(1)}% (threshold: ${THRESHOLDS.bounceRateWarning}%)`,
      'Pause sending on this domain and investigate inbox health.',
      now, now,
      'Domain', d.domain, 'domain_high_bounce_rate'
    );
  }

  // Alert: domain no replies after sufficient sends
  const noReplyDomains = db.prepare(
    `SELECT * FROM domains_daily
     WHERE date = ? AND sent > ? AND replies = 0`
  ).all(dateToday, THRESHOLDS.minSendsForJudgement) as any[];

  for (const d of noReplyDomains) {
    upsertAlert.run(
      d.client_id, 'Domain', d.domain, d.domain,
      'domain_no_replies', 'High',
      `No replies after ${d.sent} sends in last 7 days.`,
      'Check copy, targeting, and domain reputation.',
      now, now,
      'Domain', d.domain, 'domain_no_replies'
    );
  }

  // Alert: disconnected inboxes
  const disconnectedInboxes = db.prepare(
    `SELECT * FROM inboxes_snapshot WHERE smtp_status = 0 OR imap_status = 0`
  ).all() as any[];

  for (const inbox of disconnectedInboxes) {
    upsertAlert.run(
      inbox.client_id, 'Inbox', String(inbox.email_account_id), inbox.email,
      'inbox_disconnected', 'High',
      `Inbox ${inbox.email} has connection failure: ${inbox.problem_reason}`,
      'Reconnect SMTP/IMAP credentials for this inbox.',
      now, now,
      'Inbox', String(inbox.email_account_id), 'inbox_disconnected'
    );
  }

  // Alert: warmup inactive
  const warmupInactive = db.prepare(
    `SELECT * FROM inboxes_snapshot WHERE warmup_status = 0 AND smtp_status = 1`
  ).all() as any[];

  for (const inbox of warmupInactive.slice(0, 100)) {
    upsertAlert.run(
      inbox.client_id, 'Inbox', String(inbox.email_account_id), inbox.email,
      'warmup_inactive', 'Medium',
      `Inbox ${inbox.email} has warmup disabled.`,
      'Enable warmup to maintain sender reputation.',
      now, now,
      'Inbox', String(inbox.email_account_id), 'warmup_inactive'
    );
  }

  // Alert: campaign active but not sending
  const stuckCampaigns = db.prepare(
    `SELECT cs.*, cd.sent
     FROM campaigns_snapshot cs
     LEFT JOIN campaigns_daily cd ON cs.campaign_id = cd.campaign_id AND cd.date = ?
     WHERE cs.status = 'ACTIVE' AND (cd.sent IS NULL OR cd.sent = 0)`
  ).all(dateToday) as any[];

  for (const c of stuckCampaigns) {
    upsertAlert.run(
      c.client_id, 'Campaign', String(c.campaign_id), c.campaign_name,
      'campaign_active_not_sending', 'Medium',
      `Campaign "${c.campaign_name}" is ACTIVE but sent 0 emails in last 7 days.`,
      'Check schedule, inbox assignments, and lead availability.',
      now, now,
      'Campaign', String(c.campaign_id), 'campaign_active_not_sending'
    );
  }

  // Alert: high bounce rate campaign
  const highBounceCampaigns = db.prepare(
    `SELECT cd.*, cs.campaign_name
     FROM campaigns_daily cd
     JOIN campaigns_snapshot cs ON cd.campaign_id = cs.campaign_id
     WHERE cd.date = ? AND cd.bounce_rate > ? AND cd.sent > ?`
  ).all(dateToday, THRESHOLDS.bounceRateCritical, THRESHOLDS.minSendsForJudgement) as any[];

  for (const c of highBounceCampaigns) {
    upsertAlert.run(
      c.client_id, 'Campaign', String(c.campaign_id), c.campaign_name,
      'campaign_high_bounce_rate', 'Critical',
      `Campaign "${c.campaign_name}" bounce rate ${c.bounce_rate.toFixed(1)}% exceeds critical threshold.`,
      'Pause campaign immediately and audit lead list quality.',
      now, now,
      'Campaign', String(c.campaign_id), 'campaign_high_bounce_rate'
    );
  }
}

// ─── Helper functions ──────────────────────────────────────────────────────────

function guessProvider(smtpHost: string): string {
  const h = smtpHost.toLowerCase();
  if (h.includes('google') || h.includes('gmail')) return 'Google';
  if (h.includes('outlook') || h.includes('microsoft') || h.includes('office365')) return 'Microsoft';
  if (h.includes('amazon') || h.includes('aws') || h.includes('ses')) return 'Amazon SES';
  if (h.includes('sendgrid')) return 'SendGrid';
  if (h.includes('mailgun')) return 'Mailgun';
  if (h.includes('zoho')) return 'Zoho';
  if (h.includes('yahoo')) return 'Yahoo';
  return 'Custom SMTP';
}

function getRecommendedCampaignAction(label: string): string {
  switch (label) {
    case 'Winning': return 'Scale up sends — strong performance.';
    case 'Healthy': return 'Maintain current approach.';
    case 'Watch': return 'Monitor closely — insufficient volume to judge.';
    case 'Copy/List Issue': return 'Review copy and lead quality — low replies despite sends.';
    case 'Deliverability Risk': return 'Reduce send volume and check bounce sources.';
    case 'Pause Review': return 'Pause immediately — critical bounce rate detected.';
    default: return 'Gather more data before acting.';
  }
}

function getRecommendedDomainAction(
  status: string, bounceRate: number, replyRate: number, sent: number
): string {
  switch (status) {
    case 'Healthy': return 'No action needed.';
    case 'Watch': return bounceRate > THRESHOLDS.bounceRateWarning
      ? 'Monitor bounce rate — approaching threshold.'
      : 'Low reply rate — check copy and audience targeting.';
    case 'Risk': return 'Reduce sends on this domain. Investigate bounce sources.';
    case 'Burned': return 'Stop all sends on this domain. Rotate to new domain.';
    case 'Disconnected': return 'Reconnect inboxes on this domain.';
    default: return 'Monitor and investigate.';
  }
}
