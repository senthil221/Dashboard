# Data Model

This dashboard uses SQLite (via better-sqlite3) stored at `./data/dashboard.db`.
All data is fetched from Smartlead API and cached locally. The UI reads only from the local database.

---

## Tables

### `sync_log`
Tracks sync runs for observability.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| sync_type | TEXT | 'full' |
| status | TEXT | 'running', 'completed', 'failed' |
| started_at | TEXT | ISO datetime |
| finished_at | TEXT | ISO datetime or NULL |
| error | TEXT | Error message if failed |
| records_synced | INTEGER | |

---

### `clients_snapshot`
One row per Smartlead client sub-account.

| Column | Type | Source |
|--------|------|--------|
| client_id | INTEGER PK | `GET /client/` → `id` |
| client_name | TEXT | `GET /client/` → `name` |
| email | TEXT | `GET /client/` → `email` |
| synced_at | TEXT | sync timestamp |

---

### `campaigns_snapshot`
One row per campaign. Overwritten on each sync.

| Column | Type | Source |
|--------|------|--------|
| campaign_id | INTEGER PK | `GET /campaigns/` → `id` |
| client_id | INTEGER | `GET /campaigns/` → `client_id` |
| campaign_name | TEXT | `GET /campaigns/` → `name` |
| status | TEXT | ACTIVE, PAUSED, STOPPED, DRAFTED, COMPLETED |
| tags | TEXT | JSON array |
| max_leads_per_day | INTEGER | |
| synced_at | TEXT | |

---

### `campaigns_daily`
Performance metrics per campaign per date. Key analytics table.

| Column | Type | Calculation |
|--------|------|-------------|
| date | TEXT | sync date (YYYY-MM-DD) |
| campaign_id | INTEGER | FK to campaigns_snapshot |
| client_id | INTEGER | from campaigns_snapshot |
| sent | INTEGER | `overall-stats.sent_count` |
| replies | INTEGER | `overall-stats.reply_count` |
| positive_replies | INTEGER | `response-stats.interested_count` (nullable — only when response-stats available) |
| bounces | INTEGER | `overall-stats.bounce_count` |
| reply_rate | REAL | `overall-stats.reply_rate` (as returned by API, %) |
| positive_reply_rate | REAL | `positive_replies / sent * 100` (calculated, nullable) |
| bounce_rate | REAL | `overall-stats.bounce_rate` (as returned by API, %) |
| status_label | TEXT | Calculated: see thresholds.ts `getCampaignStatusLabel()` |
| recommended_action | TEXT | Derived from status_label |
| synced_at | TEXT | |

**Unique constraint:** (date, campaign_id)

---

### `domains_daily`
Performance metrics per domain per date. Powers the Domain Health Dashboard.

| Column | Type | Calculation |
|--------|------|-------------|
| date | TEXT | sync date |
| client_id | INTEGER | nullable (domain may be used across multiple clients in some setups) |
| client_name | TEXT | denormalized for query convenience |
| domain | TEXT | `domain-wise-health-metrics.domain` |
| provider | TEXT | Guessed from SMTP host |
| inbox_count | INTEGER | COUNT from inboxes_snapshot WHERE domain = ? |
| active_inbox_count | INTEGER | COUNT WHERE smtp_status=1 AND imap_status=1 |
| disconnected_inbox_count | INTEGER | COUNT WHERE smtp_status=0 OR imap_status=0 |
| warmup_active_count | INTEGER | COUNT WHERE warmup_status=1 |
| warmup_inactive_count | INTEGER | COUNT WHERE warmup_status=0 |
| avg_warmup_reputation | REAL | AVG from warmup_stats_cache JOIN inboxes (nullable) |
| sent | INTEGER | `domain-wise-health-metrics.sent_count` |
| replies | INTEGER | `domain-wise-health-metrics.reply_count` |
| positive_replies | INTEGER | Not available from domain-level API |
| bounces | INTEGER | `domain-wise-health-metrics.bounce_count` |
| reply_rate | REAL | `domain-wise-health-metrics.reply_rate` |
| positive_reply_rate | REAL | **Not available from API yet** |
| bounce_rate | REAL | `domain-wise-health-metrics.bounce_rate` |
| campaign_count | INTEGER | COUNT from campaigns using inboxes on this domain |
| last_reply_date | TEXT | **Not available from API yet** |
| status | TEXT | Calculated: see thresholds.ts `getDomainStatus()` |
| recommended_action | TEXT | Derived from status |
| synced_at | TEXT | |

**Unique constraint:** (date, domain, COALESCE(client_id, -1))

---

### `inboxes_snapshot`
One row per email account. For exception detection only — not rendered by default.

| Column | Type | Source |
|--------|------|--------|
| email_account_id | INTEGER PK | `GET /email-accounts/` → `id` |
| email | TEXT | `GET /email-accounts/` → `email` |
| domain | TEXT | Extracted from email (part after @) |
| client_id | INTEGER | `GET /email-accounts/` → `client_id` (nullable) |
| provider | TEXT | Guessed from smtp_host |
| smtp_status | INTEGER | `is_smtp_success` (1=ok, 0=failed) |
| imap_status | INTEGER | `is_imap_success` (1=ok, 0=failed) |
| warmup_status | INTEGER | `warmup_enabled` (1=on, 0=off) |
| warmup_reputation | REAL | **Not stored here** — stored in warmup_stats_cache |
| daily_sent_count | INTEGER | `message_count` (approximate, may not be reliable) |
| max_email_per_day | INTEGER | `max_email_per_day` |
| is_problem | INTEGER | 1 if any problem detected |
| problem_reason | TEXT | 'SMTP failed', 'IMAP failed', 'Warmup inactive', 'Suspended', 'Inactive' |
| synced_at | TEXT | |

---

### `warmup_stats_cache`
Cached warmup stats per inbox. Only populated when warmup stats sync is run (slow — 1 API call per inbox).

| Column | Type | Source |
|--------|------|--------|
| email_account_id | INTEGER PK | FK to inboxes_snapshot |
| warmup_reputation | REAL | `GET /email-accounts/{id}/warmup-stats` → `warmup_reputation` |
| total_sent_count | INTEGER | |
| total_spam_count | INTEGER | |
| inbox_placement_rate | REAL | |
| synced_at | TEXT | |

**Note:** Due to scale (20k+ inboxes), this table is not populated during normal sync. Enable warmup stats sync separately.

---

### `alerts`
Active, actionable alerts generated by the sync process.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| client_id | INTEGER | nullable |
| object_type | TEXT | 'Client', 'Campaign', 'Domain', 'Inbox' |
| object_id | TEXT | ID of the affected object |
| object_name | TEXT | Display name |
| alert_type | TEXT | See alert types below |
| severity | TEXT | 'Critical', 'High', 'Medium', 'Low' |
| issue | TEXT | Human-readable issue description |
| recommended_action | TEXT | Suggested fix |
| status | TEXT | 'active', 'resolved', 'snoozed' |
| first_detected_at | TEXT | ISO datetime |
| last_updated_at | TEXT | ISO datetime |

**Alert types generated:**
- `domain_high_bounce_rate` — domain bounce rate > warning threshold
- `domain_no_replies` — domain sent enough but zero replies
- `inbox_disconnected` — smtp_status=0 or imap_status=0
- `warmup_inactive` — warmup_enabled=false
- `campaign_active_not_sending` — ACTIVE campaign but 0 sent in 7 days
- `campaign_high_bounce_rate` — campaign bounce rate > critical threshold

---

## Status Calculation

See `src/lib/thresholds.ts` for the exact rules. Summary:

### Campaign Status Labels
1. `Pause Review` — bounce_rate > 3%
2. `Deliverability Risk` — bounce_rate > 2%
3. `Winning` — positive_reply_rate >= 0.5% AND bounce_rate <= 2%
4. `Healthy` — reply_rate >= 1% AND bounce_rate <= 2%
5. `Copy/List Issue` — reply_rate < 1% AND bounce_rate <= 2% AND sent >= 300
6. `Watch` — all other cases
7. `Insufficient Data` — sent < 300

### Domain Status
1. `Burned` — bounce_rate > 6%
2. `Risk` — bounce_rate > 3%
3. `Watch` — bounce_rate > 2% OR (sent >= 300 AND reply_rate < 1%)
4. `Disconnected` — all inboxes disconnected
5. `Healthy` — otherwise

### Client Status
1. `Risk` — bounce_rate > 3% OR risk_domains > 5
2. `Watch` — bounce_rate > 2% OR risk_domains > 1 OR disconnected > 5
3. `Healthy` — otherwise
