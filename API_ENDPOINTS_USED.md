# Smartlead API Endpoints Used

Base URL: `https://server.smartlead.ai/api/v1`
Authentication: `?api_key=YOUR_API_KEY` (query param)
Source: https://api.smartlead.ai/llms.txt + https://github.com/bcharleson/smartlead-cli

---

## 1. GET /client/

**Purpose:** Client Overview Dashboard — list of all agency sub-accounts

| Field | Type | Notes |
|-------|------|-------|
| Method | GET | |
| URL | `/client/` | |
| Required params | `api_key` | query param |
| Optional params | none | |

**Response fields used:**
- `id` → `clients_snapshot.client_id`
- `name` → `clients_snapshot.client_name`
- `email` → `clients_snapshot.email`

**Powers:** Client Overview Dashboard (row per client), Clients sidebar

---

## 2. GET /campaigns/

**Purpose:** Enumerate all campaigns, used for campaign table and cross-referencing

| Field | Value |
|-------|-------|
| Method | GET |
| URL | `/campaigns/` |

**Required params:** `api_key`

**Optional params:**
- `client_id` (number) — filter by sub-account
- `include_tags` (boolean) — include campaign tags

**Response fields used:**
- `id` → `campaigns_snapshot.campaign_id`
- `name` → `campaigns_snapshot.campaign_name`
- `status` → `campaigns_snapshot.status` (ACTIVE, PAUSED, STOPPED, DRAFTED, COMPLETED)
- `client_id` → `campaigns_snapshot.client_id`
- `max_leads_per_day` → `campaigns_snapshot.max_leads_per_day`
- `tags` → `campaigns_snapshot.tags` (when `include_tags=true`)

**Powers:** All dashboard views requiring campaign enumeration

---

## 3. GET /analytics/campaign/overall-stats

**Purpose:** Campaign-level sent/reply/bounce metrics for a date range

| Field | Value |
|-------|-------|
| Method | GET |
| URL | `/analytics/campaign/overall-stats` |

**Required params:** `api_key`, `start_date` (YYYY-MM-DD), `end_date` (YYYY-MM-DD)

**Optional params:** `client_id`

**Response fields used:**
- `campaign_id`
- `campaign_name`
- `client_id`
- `sent_count` → daily `sent`
- `reply_count` → daily `replies`
- `bounce_count` → daily `bounces`
- `reply_rate` → daily `reply_rate`
- `bounce_rate` → daily `bounce_rate`

**Powers:** campaigns_daily table, Campaign Performance Dashboard, Client Detail metrics

**NOT available from this endpoint:** positive replies (see #4)

---

## 4. GET /analytics/campaign/response-stats

**Purpose:** Breakdown of replies by category — used to get "Interested" count as positive replies

| Field | Value |
|-------|-------|
| Method | GET |
| URL | `/analytics/campaign/response-stats` |

**Required params:** `api_key`

**Optional params:** `client_id`, `start_date`, `end_date`

**Response fields used:**
- `campaign_id`
- `interested_count` → `campaigns_daily.positive_replies` (proxy for positive replies)
- `total_replies`

**Powers:** Positive replies metric across all dashboards

**Note:** `interested_count` (AI-categorized as "Interested") is used as the "positive reply" proxy. This may differ from manually categorized replies.

---

## 5. GET /analytics/mailbox/domain-wise-health-metrics

**Purpose:** Domain Health Dashboard — performance aggregated by sending domain

| Field | Value |
|-------|-------|
| Method | GET |
| URL | `/analytics/mailbox/domain-wise-health-metrics` |

**Required params:** `api_key`

**Optional params:** `client_id`, `start_date`, `end_date`

**Response fields used:**
- `domain`
- `sent_count` → `domains_daily.sent`
- `reply_count` → `domains_daily.replies`
- `bounce_count` → `domains_daily.bounces`
- `reply_rate` → `domains_daily.reply_rate`
- `bounce_rate` → `domains_daily.bounce_rate`

**Powers:** Domain Health Dashboard, Client Detail domain table

**NOT available from this endpoint:**
- Inbox counts per domain (derived from /email-accounts/)
- Warmup reputation (derived from /email-accounts/{id}/warmup-stats)
- Provider information (derived from SMTP host in /email-accounts/)

---

## 6. GET /analytics/mailbox/name-wise-health-metrics

**Purpose:** Per-inbox health metrics (used in domain drilldown for inbox-level analysis)

| Field | Value |
|-------|-------|
| Method | GET |
| URL | `/analytics/mailbox/name-wise-health-metrics` |

**Required params:** `api_key`

**Optional params:** `client_id`, `start_date`, `end_date`

**Response fields used:**
- `email`
- `sent_count`
- `reply_count`
- `bounce_count`
- `reply_rate`
- `bounce_rate`

**Powers:** Inbox-level analysis (available for future use; not rendered by default due to 20k+ scale)

---

## 7. GET /analytics/client/overall-stats

**Purpose:** Client-level rollup of performance metrics

| Field | Value |
|-------|-------|
| Method | GET |
| URL | `/analytics/client/overall-stats` |

**Required params:** `api_key`

**Optional params:** `start_date`, `end_date`

**Response fields used:**
- `client_id`
- `client_name`
- `sent_count`
- `reply_count`
- `bounce_count`
- `reply_rate`
- `bounce_rate`

**Powers:** Client Overview Dashboard top-level metrics

---

## 8. GET /analytics/day-wise-overall-stats

**Purpose:** Day-by-day breakdown for trend charts

| Field | Value |
|-------|-------|
| Method | GET |
| URL | `/analytics/day-wise-overall-stats` |

**Required params:** `api_key`

**Optional params:** `client_id`, `start_date`, `end_date`, `campaign_id`

**Response fields used:**
- `date`
- `sent_count`
- `reply_count`
- `bounce_count`

**Powers:** Daily trend data (available for domain drilldown charts — currently stored for future use)

---

## 9. GET /email-accounts/

**Purpose:** Inbox enumeration — fetches ALL email accounts with pagination

| Field | Value |
|-------|-------|
| Method | GET |
| URL | `/email-accounts/` |

**Required params:** `api_key`

**Optional params:**
- `offset` (number, default 0)
- `limit` (number, max 100, default 100)

**Response fields used:**
- `id` → `inboxes_snapshot.email_account_id`
- `email` → `inboxes_snapshot.email` (domain extracted from this)
- `smtp_host` → used to guess provider
- `warmup_enabled` → `inboxes_snapshot.warmup_status`
- `max_email_per_day` → `inboxes_snapshot.max_email_per_day`
- `status` → `inboxes_snapshot` problem detection (ACTIVE, INACTIVE, SUSPENDED)
- `is_smtp_success` → `inboxes_snapshot.smtp_status`
- `is_imap_success` → `inboxes_snapshot.imap_status`
- `client_id` → `inboxes_snapshot.client_id`
- `message_count` → `inboxes_snapshot.daily_sent_count`

**Powers:** Inbox Exceptions page, domain inbox counts, disconnected inbox alerts

**Scale note:** Paginated with limit=100. For 20k inboxes, this requires ~200 API calls. Run during background sync only.

---

## 10. GET /email-accounts/{id}/warmup-stats

**Purpose:** Per-inbox warmup reputation score

| Field | Value |
|-------|-------|
| Method | GET |
| URL | `/email-accounts/{email_account_id}/warmup-stats` |

**Required params:** `api_key`, `email_account_id` (path)

**Response fields used:**
- `warmup_reputation` → `warmup_stats_cache.warmup_reputation` (0–100)
- `total_sent_count`
- `total_spam_count`
- `inbox_placement_rate`

**Powers:** Avg warmup reputation on Domain Health Dashboard

**Scale warning:** NOT called for all 20k inboxes. Only called for a representative sample or on-demand per domain. This endpoint requires 1 call per inbox — impractical at scale. `avg_warmup_reputation` will show as N/A unless warmup stats sync is explicitly enabled.

---

## 11. GET /campaigns/{id}/email-accounts

**Purpose:** List inboxes assigned to a specific campaign

| Field | Value |
|-------|-------|
| Method | GET |
| URL | `/campaigns/{campaign_id}/email-accounts` |

**Required params:** `api_key`, `campaign_id` (path)

**Powers:** Domain→Campaign association mapping

---

## Metrics NOT Available from API

The following metrics were requested but cannot be calculated from available Smartlead API data:

| Metric | Status |
|--------|--------|
| Sent today (exact count for today) | **Not available from API yet** — /analytics/campaign/overall-stats requires a date range; single-day accuracy depends on using today's date as both start and end |
| Last reply date | **Not available from API yet** — no endpoint returns the date of the most recent reply per campaign or domain |
| Leads remaining in campaign | **Not available from API yet** — leads-statistics returns counts by status but not the remaining unfired leads |
| Per-domain inbox warmup reputation (aggregated) | **Partially available** — requires calling /email-accounts/{id}/warmup-stats per inbox; impractical for 20k inboxes |
| Open rate | Available in API but **intentionally omitted** per requirements (not a reliable signal for deliverability) |
| Click rate | Available in API but **intentionally omitted** per requirements |
| Inbox daily sent count (real-time) | Approximate from `message_count` field on email account — not officially documented as reliable |
