import { z } from 'zod';

// Zod schemas for validating Smartlead API responses.
// These ensure we fail gracefully when the API returns unexpected shapes.

// ─── Clients ─────────────────────────────────────────────────────────────────

export const SmartleadClientAccountSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  logo_url: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const ClientsListSchema = z.array(SmartleadClientAccountSchema);

// ─── Campaigns ───────────────────────────────────────────────────────────────

export const CampaignStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'STOPPED', 'DRAFTED', 'COMPLETED']);

export const SmartleadCampaignSchema = z.object({
  id: z.number(),
  user_id: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  status: z.union([CampaignStatusSchema, z.string()]).transform(v =>
    ['ACTIVE', 'PAUSED', 'STOPPED', 'DRAFTED', 'COMPLETED'].includes(v as string)
      ? v as 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'DRAFTED' | 'COMPLETED'
      : 'STOPPED' as const
  ),
  name: z.string(),
  client_id: z.number().nullable().optional(),
  track_settings: z.array(z.string()).nullable().optional(),
  min_time_between_email: z.number().nullable().optional(),
  max_leads_per_day: z.number().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export const CampaignsListSchema = z.array(SmartleadCampaignSchema);

// ─── Campaign Analytics ───────────────────────────────────────────────────────

export const CampaignAnalyticsSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
  status: z.string().optional(),
  sent_count: z.number().default(0),
  open_count: z.number().default(0),
  reply_count: z.number().default(0),
  bounce_count: z.number().default(0),
  click_count: z.number().default(0),
  unsubscribe_count: z.number().default(0),
  total_lead_count: z.number().default(0),
  block_count: z.number().default(0),
  in_progress_count: z.number().default(0),
  open_rate: z.number().optional(),
  reply_rate: z.number().optional(),
  bounce_rate: z.number().optional(),
  click_rate: z.number().optional(),
}).passthrough();

export const CampaignAnalyticsByDateSchema = z.array(
  z.object({
    date: z.string(),
    sent_count: z.number().default(0),
    open_count: z.number().default(0),
    reply_count: z.number().default(0),
    bounce_count: z.number().default(0),
    click_count: z.number().default(0),
    unsubscribe_count: z.number().default(0),
  }).passthrough()
);

export const CampaignLeadStatsSchema = z.object({
  total: z.number().default(0),
  interested: z.number().default(0),
  not_interested: z.number().default(0),
  meeting_booked: z.number().default(0),
  out_of_office: z.number().default(0),
  wrong_person: z.number().default(0),
  do_not_contact: z.number().default(0),
  information: z.number().default(0),
  no_response: z.number().default(0),
  not_started: z.number().default(0),
  in_progress: z.number().default(0),
  completed: z.number().default(0),
  blocked: z.number().default(0),
  paused: z.number().default(0),
  unsubscribed: z.number().default(0),
  stopped: z.number().default(0),
}).passthrough();

// ─── Aggregate Analytics ──────────────────────────────────────────────────────

export const CampaignOverallStatSchema = z.object({
  campaign_id: z.number(),
  campaign_name: z.string(),
  client_id: z.number().nullable().optional(),
  sent_count: z.number().default(0),
  open_count: z.number().default(0),
  reply_count: z.number().default(0),
  bounce_count: z.number().default(0),
  click_count: z.number().default(0),
  open_rate: z.number().default(0),
  reply_rate: z.number().default(0),
  bounce_rate: z.number().default(0),
  click_rate: z.number().default(0),
}).passthrough();

export const CampaignOverallStatsSchema = z.array(CampaignOverallStatSchema);

export const CampaignResponseStatSchema = z.object({
  campaign_id: z.number(),
  campaign_name: z.string(),
  total_replies: z.number().default(0),
  interested_count: z.number().default(0),
  not_interested_count: z.number().default(0),
  meeting_booked_count: z.number().default(0),
  out_of_office_count: z.number().default(0),
  wrong_person_count: z.number().default(0),
  do_not_contact_count: z.number().default(0),
  information_count: z.number().default(0),
  no_response_count: z.number().default(0),
}).passthrough();

export const CampaignResponseStatsSchema = z.array(CampaignResponseStatSchema);

export const DomainHealthMetricSchema = z.object({
  domain: z.string(),
  sent_count: z.number().default(0),
  reply_count: z.number().default(0),
  bounce_count: z.number().default(0),
  open_count: z.number().default(0),
  click_count: z.number().default(0),
  reply_rate: z.number().default(0),
  bounce_rate: z.number().default(0),
  open_rate: z.number().default(0),
  click_rate: z.number().default(0),
  positive_reply_count: z.number().optional(),
  inbox_count: z.number().optional(),
}).passthrough();

export const DomainHealthMetricsSchema = z.array(DomainHealthMetricSchema);

export const MailboxHealthMetricSchema = z.object({
  email: z.string(),
  sent_count: z.number().default(0),
  reply_count: z.number().default(0),
  bounce_count: z.number().default(0),
  open_count: z.number().default(0),
  click_count: z.number().default(0),
  reply_rate: z.number().default(0),
  bounce_rate: z.number().default(0),
  open_rate: z.number().default(0),
}).passthrough();

export const MailboxHealthMetricsSchema = z.array(MailboxHealthMetricSchema);

export const ClientOverallStatSchema = z.object({
  client_id: z.number(),
  client_name: z.string(),
  sent_count: z.number().default(0),
  reply_count: z.number().default(0),
  bounce_count: z.number().default(0),
  open_count: z.number().default(0),
  click_count: z.number().default(0),
  reply_rate: z.number().default(0),
  bounce_rate: z.number().default(0),
  open_rate: z.number().default(0),
  positive_reply_count: z.number().optional(),
  campaign_count: z.number().optional(),
}).passthrough();

export const ClientOverallStatsSchema = z.array(ClientOverallStatSchema);

export const DayWiseOverallStatSchema = z.object({
  date: z.string(),
  sent_count: z.number().default(0),
  reply_count: z.number().default(0),
  bounce_count: z.number().default(0),
  open_count: z.number().default(0),
  click_count: z.number().default(0),
}).passthrough();

export const DayWiseOverallStatsSchema = z.array(DayWiseOverallStatSchema);

// ─── Email Accounts ───────────────────────────────────────────────────────────

export const SmartleadEmailAccountSchema = z.object({
  id: z.number(),
  email: z.string(),
  from_name: z.string().optional().default(''),
  smtp_host: z.string().optional().default(''),
  smtp_port: z.number().optional().default(587),
  smtp_port_type: z.enum(['TLS', 'SSL', 'STARTTLS']).nullable().optional(),
  imap_host: z.string().optional().default(''),
  imap_port: z.number().optional().default(993),
  max_email_per_day: z.number().optional().default(0),
  warmup_enabled: z.boolean().optional().default(false),
  total_warmup_per_day: z.number().nullable().optional(),
  daily_rampup: z.number().nullable().optional(),
  reply_rate_percentage: z.number().nullable().optional(),
  client_id: z.number().nullable().optional(),
  status: z.string().nullable().optional(),
  is_smtp_success: z.boolean().nullable().optional(),
  is_imap_success: z.boolean().nullable().optional(),
  message_count: z.number().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
}).passthrough();

export const EmailAccountsListResponseSchema = z.union([
  z.object({
    data: z.array(SmartleadEmailAccountSchema),
    total: z.number(),
  }),
  z.array(SmartleadEmailAccountSchema).transform(arr => ({ data: arr, total: arr.length })),
]);

export const WarmupStatsSchema = z.object({
  email_account_id: z.number().optional(),
  warmup_reputation: z.number().default(0),
  total_sent_count: z.number().default(0),
  total_spam_count: z.number().default(0),
  inbox_placement_rate: z.number().default(0),
  sent_count_last_7_days: z.number().default(0),
  spam_count_last_7_days: z.number().default(0),
}).passthrough();
