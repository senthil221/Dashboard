import { z } from 'zod';
import {
  ClientsListSchema,
  CampaignsListSchema,
  CampaignAnalyticsSchema,
  CampaignAnalyticsByDateSchema,
  CampaignLeadStatsSchema,
  CampaignOverallStatsSchema,
  CampaignResponseStatsSchema,
  DomainHealthMetricsSchema,
  MailboxHealthMetricsSchema,
  ClientOverallStatsSchema,
  DayWiseOverallStatsSchema,
  EmailAccountsListResponseSchema,
  WarmupStatsSchema,
  SmartleadEmailAccountSchema,
} from './schemas';
// Use Zod-inferred types to avoid manual type/schema mismatches
type ClientsListResult = z.infer<typeof ClientsListSchema>;
type CampaignsListResult = z.infer<typeof CampaignsListSchema>;
type CampaignAnalyticsResult = z.infer<typeof CampaignAnalyticsSchema>;
type CampaignAnalyticsByDateResult = z.infer<typeof CampaignAnalyticsByDateSchema>;
type CampaignLeadStatsResult = z.infer<typeof CampaignLeadStatsSchema>;
type CampaignOverallStatsResult = z.infer<typeof CampaignOverallStatsSchema>;
type CampaignResponseStatsResult = z.infer<typeof CampaignResponseStatsSchema>;
type DomainHealthMetricsResult = z.infer<typeof DomainHealthMetricsSchema>;
type MailboxHealthMetricsResult = z.infer<typeof MailboxHealthMetricsSchema>;
type ClientOverallStatsResult = z.infer<typeof ClientOverallStatsSchema>;
type DayWiseOverallStatsResult = z.infer<typeof DayWiseOverallStatsSchema>;
type EmailAccountsListResult = z.infer<typeof EmailAccountsListResponseSchema>;
type WarmupStatsResult = z.infer<typeof WarmupStatsSchema>;

const BASE_URL = 'https://server.smartlead.ai/api/v1';

// Rate limiting: 10 req/s max per Smartlead docs
const RATE_LIMIT_DELAY_MS = 120;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

export class SmartleadAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string
  ) {
    super(message);
    this.name = 'SmartleadAPIError';
  }
}

export class SmartleadValidationError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly issues: z.ZodIssue[]
  ) {
    super(message);
    this.name = 'SmartleadValidationError';
  }
}

export class SmartleadClient {
  private apiKey: string;
  private lastRequestTime = 0;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.SMARTLEAD_API_KEY;
    if (!key) throw new Error('SMARTLEAD_API_KEY is not set');
    this.apiKey = key;
  }

  private async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await delay(RATE_LIMIT_DELAY_MS - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined | null>): string {
    const params = new URLSearchParams({ api_key: this.apiKey });
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) {
          params.set(k, String(v));
        }
      }
    }
    return `${BASE_URL}${path}?${params.toString()}`;
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestOptions = {}
  ): Promise<T> {
    await this.throttle();

    const url = this.buildUrl(path, options.query);
    const method = options.method ?? 'GET';

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (err) {
      throw new SmartleadAPIError(
        `Network error on ${path}: ${err instanceof Error ? err.message : String(err)}`,
        0,
        path
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new SmartleadAPIError(
        `Smartlead API error ${response.status} on ${path}: ${text}`,
        response.status,
        path
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new SmartleadAPIError(`Invalid JSON response from ${path}`, response.status, path);
    }

    const result = schema.safeParse(json);
    if (!result.success) {
      // Log schema mismatch but don't crash — return a best-effort parse
      console.warn(
        `[Smartlead] Schema mismatch on ${path}:`,
        result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
      );
      throw new SmartleadValidationError(
        `Schema validation failed for ${path}`,
        path,
        result.error.issues
      );
    }

    return result.data;
  }

  // ─── Clients ───────────────────────────────────────────────────────────────

  async listClients(): Promise<ClientsListResult> {
    return this.request('/client/', ClientsListSchema);
  }

  // ─── Campaigns ─────────────────────────────────────────────────────────────

  async listCampaigns(clientId?: number): Promise<CampaignsListResult> {
    return this.request('/campaigns/', CampaignsListSchema, {
      query: { client_id: clientId, include_tags: true },
    });
  }

  async getCampaignAnalytics(campaignId: number, clientId?: number): Promise<CampaignAnalyticsResult> {
    return this.request(
      `/campaigns/${campaignId}/analytics`,
      CampaignAnalyticsSchema,
      { query: { client_id: clientId } }
    );
  }

  async getCampaignAnalyticsByDate(
    campaignId: number,
    startDate: string,
    endDate: string,
    clientId?: number
  ): Promise<CampaignAnalyticsByDateResult> {
    return this.request(
      `/campaigns/${campaignId}/analytics-by-date`,
      CampaignAnalyticsByDateSchema,
      { query: { start_date: startDate, end_date: endDate, client_id: clientId } }
    );
  }

  async getCampaignLeadStats(campaignId: number, clientId?: number): Promise<CampaignLeadStatsResult> {
    return this.request(
      `/campaigns/${campaignId}/leads-statistics`,
      CampaignLeadStatsSchema,
      { query: { client_id: clientId } }
    );
  }

  // ─── Aggregate Analytics ────────────────────────────────────────────────────

  async getCampaignOverallStats(
    startDate: string,
    endDate: string,
    clientId?: number
  ): Promise<CampaignOverallStatsResult> {
    return this.request(
      '/analytics/campaign/overall-stats',
      CampaignOverallStatsSchema,
      { query: { start_date: startDate, end_date: endDate, client_id: clientId } }
    );
  }

  async getCampaignResponseStats(
    startDate?: string,
    endDate?: string,
    clientId?: number
  ): Promise<CampaignResponseStatsResult> {
    return this.request(
      '/analytics/campaign/response-stats',
      CampaignResponseStatsSchema,
      { query: { start_date: startDate, end_date: endDate, client_id: clientId } }
    );
  }

  async getDomainHealthMetrics(
    startDate?: string,
    endDate?: string,
    clientId?: number
  ): Promise<DomainHealthMetricsResult> {
    return this.request(
      '/analytics/mailbox/domain-wise-health-metrics',
      DomainHealthMetricsSchema,
      { query: { start_date: startDate, end_date: endDate, client_id: clientId } }
    );
  }

  async getMailboxHealthMetrics(
    startDate?: string,
    endDate?: string,
    clientId?: number
  ): Promise<MailboxHealthMetricsResult> {
    return this.request(
      '/analytics/mailbox/name-wise-health-metrics',
      MailboxHealthMetricsSchema,
      { query: { start_date: startDate, end_date: endDate, client_id: clientId } }
    );
  }

  async getClientOverallStats(
    startDate?: string,
    endDate?: string
  ): Promise<ClientOverallStatsResult> {
    return this.request(
      '/analytics/client/overall-stats',
      ClientOverallStatsSchema,
      { query: { start_date: startDate, end_date: endDate } }
    );
  }

  async getDayWiseOverallStats(
    startDate?: string,
    endDate?: string,
    clientId?: number,
    campaignId?: number
  ): Promise<DayWiseOverallStatsResult> {
    return this.request(
      '/analytics/day-wise-overall-stats',
      DayWiseOverallStatsSchema,
      { query: { start_date: startDate, end_date: endDate, client_id: clientId, campaign_id: campaignId } }
    );
  }

  // ─── Email Accounts ────────────────────────────────────────────────────────

  async listEmailAccounts(offset = 0, limit = 100): Promise<EmailAccountsListResult> {
    return this.request(
      '/email-accounts/',
      EmailAccountsListResponseSchema,
      { query: { offset, limit } }
    );
  }

  // Fetches ALL email accounts with pagination. Use carefully — 20k+ inboxes.
  async listAllEmailAccounts(onProgress?: (fetched: number, total: number) => void): Promise<EmailAccountsListResult['data']> {
    const pageSize = 100;
    const all: EmailAccountsListResult['data'] = [];
    let offset = 0;

    const first = await this.listEmailAccounts(0, pageSize);
    all.push(...first.data);
    onProgress?.(all.length, first.total);

    while (all.length < first.total) {
      offset += pageSize;
      await delay(RATE_LIMIT_DELAY_MS);
      const page = await this.listEmailAccounts(offset, pageSize);
      if (page.data.length === 0) break;
      all.push(...page.data);
      onProgress?.(all.length, first.total);
    }

    return all;
  }

  async getWarmupStats(emailAccountId: number): Promise<WarmupStatsResult> {
    return this.request(
      `/email-accounts/${emailAccountId}/warmup-stats`,
      WarmupStatsSchema
    );
  }

  async getCampaignEmailAccounts(campaignId: number): Promise<EmailAccountsListResult['data']> {
    const schema = z.array(SmartleadEmailAccountSchema.passthrough()).or(
      z.object({ data: z.array(SmartleadEmailAccountSchema.passthrough()) }).transform(r => r.data)
    );
    return this.request(`/campaigns/${campaignId}/email-accounts`, schema);
  }
}

// Singleton for server-side use
let _client: SmartleadClient | null = null;

export function getSmartleadClient(): SmartleadClient {
  if (!_client) {
    _client = new SmartleadClient();
  }
  return _client;
}
