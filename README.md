# SendOps — Smartlead Agency Dashboard

A clean, premium internal dashboard for cold email agencies managing 20,000–22,000 inboxes across ~300 domains using Smartlead.

## Prerequisites

- Node.js 18+
- A Smartlead account with API access

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Edit .env.local and set SMARTLEAD_API_KEY=your_key_here

# 3. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) then click **Sync Now**.

## First Sync

The first sync fetches all your data from Smartlead:
- Clients, campaigns, analytics (fast)
- All 20k+ inboxes via paginated `/email-accounts/` (4–5 min)

Subsequent syncs update only what changed.

## Dashboard Pages

| Page | URL | Description |
|------|-----|-------------|
| Client Overview | `/` | All clients, key metrics, last 7 days |
| Client Detail | `/clients/{id}` | Campaigns + domains for one client |
| Campaigns | `/campaigns` | All campaigns, filterable |
| Domains | `/domains` | Domain Health — most important ops page |
| Domain Drilldown | `/domains/{domain}` | Per-domain detail + problem inboxes only |
| Alerts | `/alerts` | Actionable issues sorted by severity |
| Inbox Exceptions | `/inbox-exceptions` | Problem inboxes only (not all 20k) |
| Settings | `/settings` | Thresholds, sync history, DB stats |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMARTLEAD_API_KEY` | **Yes** | — | Smartlead API key |
| `DATABASE_PATH` | No | `./data/dashboard.db` | SQLite file location |

## Architecture

```
Smartlead API
    ↓ (sync via POST /api/sync)
SQLite (./data/dashboard.db)
    ↓ (read-only)
Next.js UI
```

The UI never calls Smartlead directly — all data goes through the local database.

## Configuration

Edit `src/lib/thresholds.ts` to change status thresholds:
- Bounce rate warning/critical
- Reply rate warning
- Warmup reputation thresholds
- Minimum sends before judging

See `THRESHOLDS.md` for full documentation.

## Documentation

- `API_ENDPOINTS_USED.md` — Every Smartlead endpoint, params, response fields used
- `DATA_MODEL.md` — Database tables and metric calculations
- `THRESHOLDS.md` — Status labels and alert rules

## Production Build

```bash
npm run build
npm start
```
