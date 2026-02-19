# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anrok Deal Analyzer is a Vercel application that analyzes sales deals by receiving Gong call webhooks, analyzing conversations with Claude AI, and posting insights to Slack. It integrates with Salesforce CRM, Gong conversation intelligence, and Google Sheets for deal tracking.

## Commands

All commands run from `vercel-app/`:

```bash
npm run dev              # Start Next.js dev server (http://localhost:3000)
npm run build            # Build for production
npm run lint             # ESLint check
npm run db:migrate       # Run database migrations (requires .env.local)
npm run trigger-analyses # Batch trigger analysis for deals
```

## Architecture

### Data Flow

```
Gong Webhook → API Route → Store (Postgres meta + Blob content) → Claude Analysis → Slack
                                                                                   ↓
                                                              Google Sheets (beta analysis)
```

### Main API Endpoints

**Core Analysis (API key auth via `x-api-key` header)**
- `/api/analyze-deal` - POST. Fetches deal interactions, sends to Claude Sonnet 4, posts analysis to Slack. Body: `{ crmId, dealId, analysisType }` (either `crmId` or `dealId` required)
- `/api/analyze-deal-beta` - POST. CoM Enhanced structured analysis with MEDDPICC coaching. Syncs Salesforce fields, writes to Google Sheets. Body: `{ crmId, dealId, skipSlack }`
- `/api/track-deal` - POST. Writes deal data to Google Sheets. Body: `{ crmId, dealSummary, currentNextSteps, untappedOpportunities, risks }`
- `/api/backfill-deal` - POST. Backfills historical calls from Gong. Body: `{ crmId, callIds, fromDate, toDate, autoAnalyze }`
- `/api/import-emails` - POST. Bulk email import. Body: `{ emails: [{ crmId, subject, from, to, timestamp, body }], triggerAnalysis }`
- `/api/download-transcripts` - GET. Downloads all transcripts as ZIP. Query: `?format=json|txt&includeExcluded=true&dealId=...`
- `/api/deal-transcripts` - POST. Downloads transcripts for a specific deal. Body: `{ crm_id, channel_id, download }`. Also supports Slack slash command format.

**No Auth**
- `/api/view-deal` - GET. Returns complete deal info. Query: `?crmId=...` or `?dealId=...`

**Webhook / Signature Verified**
- `/api/gong-webhook` - POST. Receives Gong webhooks (JWT verified), fetches transcript, stores data, triggers analysis. Always returns 200 to prevent retries.
- `/api/slack-interactions` - POST. Handles Slack interactive actions (exclude/include buttons). Slack signature verified.

**Slack Slash Commands (also callable via API with `x-api-key` header or `api_key` in body)**
- `/api/prospect-insights` - POST. Aggregate feedback analysis from active deals. Body: `{ channel_id, days, api_key }`
- `/api/customer-insights` - POST. Post-sales customer feedback analysis. Body: `{ channel_id, days, api_key }`
- `/api/closed-lost-insights` - POST. Lost deal analysis themes. Body: `{ channel_id, days, api_key }` (defaults to 30 days)
- `/api/slack-transcripts` - POST. Download recent transcripts via Slack. Body: `{ channel_id, days, api_key }`

**Deprecated**
- `/api/slack-insights` - POST. Returns 410 with guidance to use the specific insight endpoints above.

### Key Modules (in vercel-app/lib/)

- `db/` - Postgres operations. `client.ts` has core queries, `schema.sql` defines tables with indexes
- `claude/` - Claude API integration using `claude-sonnet-4-20250514`. Response parsing handles multiple header formats with fallback strategies.
- `blob/` - Vercel Blob storage for transcripts and emails
- `gong/` - Gong API client and webhook JWT verification
- `slack/` - Slack Web API, Block Kit formatting, signature verification, channel routing by deal segment
- `analysis/` - Context building, prompt loading, and template substitution
- `auth/` - Multi-tier API key validation: internal request bypass, legacy `INTERNAL_API_KEY`, and new `dak_*` keys with SHA-256 hashing and usage tracking
- `salesforce/` - Salesforce OAuth client. Fetches opportunity fields (role_segment, ARR, owner, stage, close date, probability)
- `google/` - Google Sheets integration. Upserts deal tracking data to "All Deals" tab via service account
- `insights/` - Aggregate insights analysis using map-reduce over transcript batches (groups of 10) with Claude

### Database Schema

Five tables in Postgres:
- `deals` - Opportunity records (keyed by `crm_id` for Salesforce). Includes `role_segment` and `arr` fields.
- `interactions` - Calls/emails with `external_id` for idempotency
- `manual_emails` - Manually imported emails
- `analyses` - Claude analysis results with `analysis_type` (active_health, closed_lost, closed_won, customer_sentiment, com_enhanced). Includes `structured_data` JSONB column for beta analysis output.
- `api_keys` - Multi-client API key management. Keys use `dak_` prefix, SHA-256 hashed storage, usage tracking, and soft-delete revocation.

Content is stored in Blob storage; metadata and relationships in Postgres.

### Prompts

Analysis prompts live in `vercel-app/prompts/`:
- `active-deal-analysis.md` - Active deal health analysis (1-10 score)
- `deal-loss-analysis.md` - Lost deal post-mortem
- `customer-sentiment.md` - Sentiment analysis (customer voice focus)
- `com-enhanced-analysis.md` - CoM Enhanced structured analysis with MEDDPICC coaching (JSON output with scores, stakeholders, differentiators)

## Development Patterns

- Webhook handlers return 200 even on errors to prevent external service retries
- "Fire-and-forget" pattern for analysis triggering - socket errors are expected
- All logs prefixed with component name: `[Gong Webhook]`, `[Claude]`, `[Slack]`
- Parameterized queries for all database operations
- TypeScript strict mode enabled
- Path alias `@/*` maps to project root

## Environment Variables

Required in `.env.local` (not in git):

**Core**
- `ANTHROPIC_API_KEY` - Claude API
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob
- `DATABASE_URL`, `DATABASE_URL_UNPOOLED` - Postgres (pooled for app, unpooled for migrations)
- `INTERNAL_API_KEY` - Legacy internal endpoint authentication

**Gong**
- `GONG_ACCESS_KEY`, `GONG_ACCESS_KEY_SECRET` - Gong API credentials
- `GONG_WEBHOOK_PUBLIC_KEY` - JWT verification key

**Slack**
- `SLACK_BOT_TOKEN` - Slack API bot token
- `SLACK_SIGNING_SECRET` - Slack request signature verification
- `SLACK_CHANNEL_ID` - Default channel (receives all deals)
- `SLACK_CHANNEL_ENTERPRISE`, `SLACK_CHANNEL_COMMERCIAL`, `SLACK_CHANNEL_MID_MARKET`, `SLACK_CHANNEL_OTHER` - Segment-specific channels (comma-separated for multi-channel)

**Salesforce**
- `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` - OAuth credentials
- `SALESFORCE_REFRESH_TOKEN` - OAuth refresh token
- `SALESFORCE_INSTANCE_URL` - Salesforce instance URL

**Google Sheets**
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email
- `GOOGLE_PRIVATE_KEY` - Service account private key
- `GOOGLE_SPREADSHEET_ID` - Target spreadsheet ID

## Testing Endpoints

Use these curl examples to test endpoints. Replace `YOUR_API_KEY` with a valid `dak_*` key (generate via `node scripts/api-keys.js create --name "Test"`). For local dev, use `http://localhost:3000`; for production, use your Vercel deployment URL.

### API Key Authenticated Endpoints

```bash
# Analyze a deal (primary analysis)
curl -X POST https://YOUR_HOST/api/analyze-deal \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"crmId": "006XXXXXXXXXXXXXXX"}'

# Analyze a deal (customer sentiment)
curl -X POST https://YOUR_HOST/api/analyze-deal \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"crmId": "006XXXXXXXXXXXXXXX", "analysisType": "customer_sentiment"}'

# Beta CoM Enhanced analysis
curl -X POST https://YOUR_HOST/api/analyze-deal-beta \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"crmId": "006XXXXXXXXXXXXXXX", "skipSlack": true}'

# Backfill historical calls from Gong
curl -X POST https://YOUR_HOST/api/backfill-deal \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"crmId": "006XXXXXXXXXXXXXXX", "autoAnalyze": false}'

# Track deal to Google Sheets
curl -X POST https://YOUR_HOST/api/track-deal \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"crmId": "006XXXXXXXXXXXXXXX"}'

# Import emails
curl -X POST https://YOUR_HOST/api/import-emails \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"emails": [{"crmId": "006XXXXXXXXXXXXXXX", "subject": "Follow up", "from": "rep@company.com", "to": "buyer@prospect.com", "timestamp": "2026-01-15T10:00:00Z", "body": "Email content here"}], "triggerAnalysis": false}'

# Download all transcripts as ZIP
curl -H "x-api-key: YOUR_API_KEY" \
  "https://YOUR_HOST/api/download-transcripts?format=txt" -o transcripts.zip

# Download transcripts for a specific deal (direct download)
curl -X POST https://YOUR_HOST/api/deal-transcripts \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"crm_id": "006XXXXXXXXXXXXXXX", "channel_id": "C0123456789", "download": true}' \
  -o deal-transcripts.zip
```

### No Auth Endpoints

```bash
# View deal info
curl "https://YOUR_HOST/api/view-deal?crmId=006XXXXXXXXXXXXXXX"
```

### Slash Command Endpoints (via API)

These endpoints are primarily triggered by Slack slash commands but can also be called directly with an API key. Results are posted to the specified Slack channel.

```bash
# Prospect insights (active deals, last 14 days)
curl -X POST https://YOUR_HOST/api/prospect-insights \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"channel_id": "C0123456789", "days": 14}'

# Customer insights (closed-won, last 14 days)
curl -X POST https://YOUR_HOST/api/customer-insights \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"channel_id": "C0123456789", "days": 14}'

# Closed-lost insights (last 30 days)
curl -X POST https://YOUR_HOST/api/closed-lost-insights \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"channel_id": "C0123456789", "days": 30}'

# Download recent transcripts via API
curl -X POST https://YOUR_HOST/api/slack-transcripts \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"channel_id": "C0123456789", "days": 7}'
```

### Endpoints That Cannot Be Curl'd

- `/api/gong-webhook` - Requires Gong JWT signature verification
- `/api/slack-interactions` - Requires Slack request signature verification
- `/api/slack-insights` - Deprecated (returns 410)

## Utility Scripts

Scripts in `vercel-app/scripts/` for development and debugging. Run from the `vercel-app/` directory.

```bash
# API Key Management
node scripts/api-keys.js create --name "Sales Team"   # Create a new API key
node scripts/api-keys.js list                          # List all keys
node scripts/api-keys.js revoke --prefix "dak_xxxx"    # Revoke a key

# Deal Inspection
node scripts/list-deals.js                             # List all deals with CRM IDs

# Batch Analysis
node scripts/batch-active-analysis.js                  # Run primary analysis on all non-closed deals
node scripts/batch-beta-analysis.js                    # Run CoM Enhanced analysis on all non-closed deals
node scripts/rerun-beta-since.js "2026-02-04 09:02" America/Los_Angeles  # Re-run beta since date

# Transcript Export
node scripts/download-transcripts.js --txt --stats     # Export all transcripts as ZIP

# Salesforce Debugging
node scripts/sf-describe.js                            # Query Salesforce field definitions
node scripts/sf-inspect-opp.js                         # Inspect opportunity quotes/line items
node scripts/sf-product-values.js                      # Query product values
node scripts/sf-quote-all-fields.js                    # Fetch all quote fields

# Salesforce/DB Comparison
node scripts/compare-stages.js                         # Compare Salesforce stages with database
```

## Deployment

```bash
cd vercel-app
vercel --prod           # Deploy
vercel env pull         # Pull production env vars for local dev
npm run db:migrate      # Run migrations
```
