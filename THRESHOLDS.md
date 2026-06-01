# Status and Alert Thresholds

All thresholds are defined in `src/lib/thresholds.ts` and can be changed there.

## Default Values

| Threshold | Value | Meaning |
|-----------|-------|---------|
| `bounceRateWarning` | 2.0% | Bounce rate above this = Watch status |
| `bounceRateCritical` | 3.0% | Bounce rate above this = Risk / Pause Review |
| `replyRateWarning` | 1.0% | Reply rate below this (with enough sends) = Watch |
| `minSendsForJudgement` | 300 | Minimum sends before status labels are applied |
| `warmupReputationWarning` | 90 | Warmup reputation below this = Watch |
| `warmupReputationCritical` | 80 | Warmup reputation below this = Risk |
| `positiveReplyRateWarning` | 0.5% | Positive reply rate below this = not Winning |
| `replyRateDropThreshold` | 1.5pp | Reply rate drop vs prior 7 days triggers alert |
| `bounceRateIncreaseThreshold` | 1.0pp | Bounce rate increase vs prior 7 days triggers alert |
| `inboxOveruseThreshold` | 50 | Max emails/day before inbox considered overused |

## Campaign Status Labels

Applied after `minSendsForJudgement` sends have been reached.

| Label | Condition |
|-------|-----------|
| `Pause Review` | bounce_rate > 3% |
| `Deliverability Risk` | bounce_rate > 2% |
| `Winning` | positive_reply_rate ≥ 0.5% AND bounce_rate ≤ 2% |
| `Healthy` | reply_rate ≥ 1% AND bounce_rate ≤ 2% |
| `Copy/List Issue` | reply_rate < 1% AND bounce_rate ≤ 2% |
| `Watch` | All other cases |
| `Insufficient Data` | sent < 300 |

## Domain Status

| Status | Condition |
|--------|-----------|
| `Burned` | bounce_rate > 6% (2× critical) |
| `Risk` | bounce_rate > 3% |
| `Watch` | bounce_rate > 2% OR (sent ≥ 300 AND reply_rate < 1%) |
| `Disconnected` | All inboxes on domain are disconnected |
| `Healthy` | None of the above |

## Client Status

| Status | Condition |
|--------|-----------|
| `Risk` | bounce_rate > 3% OR risk_domains > 5 |
| `Watch` | bounce_rate > 2% OR risk_domains > 1 OR disconnected_inboxes > 5 |
| `Healthy` | None of the above |

## Alert Severity

| Severity | Examples |
|----------|---------|
| `Critical` | Campaign bounce rate > 3%, critical inbox failures |
| `High` | Domain bounce rate above threshold, disconnected inbox |
| `Medium` | Warmup inactive, campaign not sending |
| `Low` | Informational alerts |

## What is NOT Available (no threshold can fix this)

- `Last reply date` — not returned by any Smartlead API endpoint
- `Sent today` (exact) — requires today as single-day date range in analytics
- `Leads remaining` — no endpoint returns unfired lead count
- `Per-inbox warmup reputation` at scale — 1 API call per inbox, impractical for 20k+
