// Configurable thresholds for status labels and alerts.
// Edit these values to adjust what triggers Watch / Risk / Critical states.

export const THRESHOLDS = {
  // Bounce rate percentages
  bounceRateWarning: 2.0,   // >2% = Watch
  bounceRateCritical: 3.0,  // >3% = Risk / Deliverability Risk

  // Reply rate percentages
  replyRateWarning: 1.0,    // <1% after minSendsForJudgement = Watch

  // Minimum sends before judging a campaign/domain
  minSendsForJudgement: 300,

  // Warmup reputation scores
  warmupReputationWarning: 90,  // <90 = Watch
  warmupReputationCritical: 80, // <80 = Risk

  // Positive reply rate thresholds (from "Interested" category)
  positiveReplyRateWarning: 0.5,  // <0.5% with enough volume = Watch

  // Reply rate drop: if reply rate drops by this many percentage points vs prior 7 days, alert
  replyRateDropThreshold: 1.5,

  // Bounce rate increase: if bounce rate increases by this many percentage points vs prior 7 days
  bounceRateIncreaseThreshold: 1.0,

  // Max emails per inbox per day before considered "overused"
  inboxOveruseThreshold: 50,
} as const;

export type Thresholds = typeof THRESHOLDS;

// Campaign status labels derived from metrics
export type CampaignStatusLabel =
  | 'Winning'
  | 'Healthy'
  | 'Watch'
  | 'Copy/List Issue'
  | 'Deliverability Risk'
  | 'Pause Review'
  | 'Insufficient Data';

export function getCampaignStatusLabel(
  sentLast7d: number,
  replyRate: number,
  bounceRate: number,
  positiveReplyRate: number | null
): CampaignStatusLabel {
  if (sentLast7d < THRESHOLDS.minSendsForJudgement) return 'Insufficient Data';
  if (bounceRate > THRESHOLDS.bounceRateCritical) return 'Pause Review';
  if (bounceRate > THRESHOLDS.bounceRateWarning) return 'Deliverability Risk';
  if (positiveReplyRate !== null && positiveReplyRate >= THRESHOLDS.positiveReplyRateWarning && bounceRate <= THRESHOLDS.bounceRateWarning) return 'Winning';
  if (replyRate >= THRESHOLDS.replyRateWarning && bounceRate <= THRESHOLDS.bounceRateWarning) return 'Healthy';
  if (replyRate < THRESHOLDS.replyRateWarning && bounceRate <= THRESHOLDS.bounceRateWarning) return 'Copy/List Issue';
  return 'Watch';
}

export type DomainStatus = 'Healthy' | 'Watch' | 'Risk' | 'Burned' | 'Disconnected';

export function getDomainStatus(
  bounceRate: number,
  replyRate: number,
  disconnectedCount: number,
  totalCount: number,
  sentLast7d: number
): DomainStatus {
  if (disconnectedCount > 0 && disconnectedCount === totalCount) return 'Disconnected';
  if (bounceRate > THRESHOLDS.bounceRateCritical * 2) return 'Burned';
  if (bounceRate > THRESHOLDS.bounceRateCritical) return 'Risk';
  if (bounceRate > THRESHOLDS.bounceRateWarning) return 'Watch';
  if (sentLast7d >= THRESHOLDS.minSendsForJudgement && replyRate < THRESHOLDS.replyRateWarning) return 'Watch';
  return 'Healthy';
}

export type ClientStatus = 'Healthy' | 'Watch' | 'Risk';

export function getClientStatus(
  riskDomains: number,
  disconnectedInboxes: number,
  bounceRate: number
): ClientStatus {
  if (bounceRate > THRESHOLDS.bounceRateCritical || riskDomains > 5) return 'Risk';
  if (bounceRate > THRESHOLDS.bounceRateWarning || riskDomains > 1 || disconnectedInboxes > 5) return 'Watch';
  return 'Healthy';
}
