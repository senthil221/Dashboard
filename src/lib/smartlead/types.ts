// TypeScript types for Smartlead API responses.
// All types derived from documented endpoints only — no invented fields.

// ─── Clients ─────────────────────────────────────────────────────────────────

export interface SmartleadClientAccount {
  id: number;
  name: string;
  email: string;
  logo_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'DRAFTED' | 'COMPLETED';

export interface SmartleadCampaign {
  id: number;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  status: CampaignStatus;
  name: string;
  client_id?: number | null;
  track_settings?: string[] | null;
  scheduler_cron_value?: unknown | null;
  min_time_between_email?: number | null;
  max_leads_per_day?: number | null;
  tags?: string[];
}

// ─── Campaign Analytics ───────────────────────────────────────────────────────

// GET /campaigns/{id}/analytics
export interface CampaignAnalytics {
  id: number;
  name: string;
  status: CampaignStatus;
  sent_count: number;
  open_count: number;
  reply_count: number;
  bounce_count: number;
  click_count: number;
  unsubscribe_count: number;
  total_lead_count: number;
  block_count: number;
  in_progress_count: number;
  // Rates are not always returned; may need to be calculated
  open_rate?: number;
  reply_rate?: number;
  bounce_rate?: number;
  click_rate?: number;
}

// GET /campaigns/{id}/analytics-by-date
export interface CampaignAnalyticsByDate {
  date: string; // YYYY-MM-DD
  sent_count: number;
  open_count: number;
  reply_count: number;
  bounce_count: number;
  click_count: number;
  unsubscribe_count: number;
}

// GET /campaigns/{id}/leads-statistics
export interface CampaignLeadStats {
  total: number;
  interested: number;
  not_interested: number;
  meeting_booked: number;
  out_of_office: number;
  wrong_person: number;
  do_not_contact: number;
  information: number;
  no_response: number;
  not_started: number;
  in_progress: number;
  completed: number;
  blocked: number;
  paused: number;
  unsubscribed: number;
  stopped: number;
}

// ─── Aggregate Analytics ──────────────────────────────────────────────────────

// GET /analytics/campaign/overall-stats
export interface CampaignOverallStat {
  campaign_id: number;
  campaign_name: string;
  client_id?: number | null;
  sent_count: number;
  open_count: number;
  reply_count: number;
  bounce_count: number;
  click_count: number;
  open_rate: number;
  reply_rate: number;
  bounce_rate: number;
  click_rate: number;
}

// GET /analytics/campaign/response-stats
export interface CampaignResponseStat {
  campaign_id: number;
  campaign_name: string;
  total_replies: number;
  interested_count: number;
  not_interested_count: number;
  meeting_booked_count: number;
  out_of_office_count: number;
  wrong_person_count: number;
  do_not_contact_count: number;
  information_count: number;
  no_response_count: number;
}

// GET /analytics/mailbox/domain-wise-health-metrics
export interface DomainHealthMetric {
  domain: string;
  sent_count: number;
  reply_count: number;
  bounce_count: number;
  open_count: number;
  click_count: number;
  reply_rate: number;
  bounce_rate: number;
  open_rate: number;
  click_rate: number;
  // These may or may not be present depending on API version
  positive_reply_count?: number;
  inbox_count?: number;
}

// GET /analytics/mailbox/name-wise-health-metrics
export interface MailboxHealthMetric {
  email: string;
  sent_count: number;
  reply_count: number;
  bounce_count: number;
  open_count: number;
  click_count: number;
  reply_rate: number;
  bounce_rate: number;
  open_rate: number;
}

// GET /analytics/client/overall-stats
export interface ClientOverallStat {
  client_id: number;
  client_name: string;
  sent_count: number;
  reply_count: number;
  bounce_count: number;
  open_count: number;
  click_count: number;
  reply_rate: number;
  bounce_rate: number;
  open_rate: number;
  // May or may not be returned
  positive_reply_count?: number;
  campaign_count?: number;
}

// GET /analytics/day-wise-overall-stats
export interface DayWiseOverallStat {
  date: string; // YYYY-MM-DD
  sent_count: number;
  reply_count: number;
  bounce_count: number;
  open_count: number;
  click_count: number;
}

// ─── Email Accounts ───────────────────────────────────────────────────────────

export type EmailAccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PAUSED';

export interface SmartleadEmailAccount {
  id: number;
  email: string;
  from_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_port_type: 'TLS' | 'SSL' | 'STARTTLS' | null;
  imap_host: string;
  imap_port: number;
  max_email_per_day: number;
  warmup_enabled: boolean;
  total_warmup_per_day: number | null;
  daily_rampup: number | null;
  reply_rate_percentage: number | null;
  client_id: number | null;
  status: EmailAccountStatus | null;
  // Connection health — may be present
  is_smtp_success?: boolean | null;
  is_imap_success?: boolean | null;
  // Message count today
  message_count?: number | null;
  // Created/updated timestamps
  created_at?: string;
  updated_at?: string;
}

// Paginated email accounts response
export interface EmailAccountsListResponse {
  data: SmartleadEmailAccount[];
  total: number;
}

// GET /email-accounts/{id}/warmup-stats
export interface WarmupStats {
  email_account_id: number;
  warmup_reputation: number;       // 0-100 reputation score
  total_sent_count: number;
  total_spam_count: number;
  inbox_placement_rate: number;    // percentage in inbox vs spam
  // Last 7 days breakdown
  sent_count_last_7_days: number;
  spam_count_last_7_days: number;
}
