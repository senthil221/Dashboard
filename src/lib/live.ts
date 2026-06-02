import { format, subDays } from 'date-fns';
import { THRESHOLDS } from './thresholds';

export function today(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function daysAgo(n: number): string {
  return format(subDays(new Date(), n), 'yyyy-MM-dd');
}

export function campaignAction(label: string): string {
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

export function domainAction(status: string, bounceRate: number): string {
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
