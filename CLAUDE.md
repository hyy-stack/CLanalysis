# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anrok Deal Analyzer is a Vercel application that analyzes sales deals by receiving Gong call webhooks, analyzing conversations with Claude AI, and posting insights to Slack. It integrates with Salesforce CRM and Gong conversation intelligence.

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
```

### Main API Endpoints

- `/api/gong-webhook` - Receives Gong webhooks, fetches transcript, stores data, triggers analysis. Always returns 200 (even on error) to prevent Gong retries.
- `/api/analyze-deal` - Fetches deal interactions, sends to Claude Sonnet 4, posts analysis to Slack
- `/api/import-emails` - Manual email import for deals
- `/api/backfill-deal` - Backfill historical calls from Gong
- `/api/post-to-slack` - Format and post analysis to Slack
- `/api/slack-interactions` - Handle Slack interactive actions

### Key Modules (in vercel-app/lib/)

- `db/` - Postgres operations. `client.ts` has core queries, `schema.sql` defines tables with indexes
- `claude/` - Claude API integration using `claude-sonnet-4-20250514`. Response parsing handles multiple header formats with fallback strategies.
- `blob/` - Vercel Blob storage for transcripts and emails
- `gong/` - Gong API client and webhook JWT verification
- `slack/` - Slack Web API, Block Kit formatting, signature verification
- `analysis/` - Context building and prompt selection
- `auth/` - API key validation

### Database Schema

Four core tables in Postgres:
- `deals` - Opportunity records (keyed by `crm_id` for Salesforce)
- `interactions` - Calls/emails with `external_id` for idempotency
- `manual_emails` - Manually imported emails
- `analyses` - Claude analysis results with `analysis_type`

Content is stored in Blob storage; metadata and relationships in Postgres.

### Prompts

Analysis prompts live in `vercel-app/prompts/`:
- `active-deal-analysis.md` - Active deal health analysis
- `deal-loss-analysis.md` - Lost deal post-mortem
- `customer-sentiment.md` - Sentiment analysis

## Development Patterns

- Webhook handlers return 200 even on errors to prevent external service retries
- "Fire-and-forget" pattern for analysis triggering - socket errors are expected
- All logs prefixed with component name: `[Gong Webhook]`, `[Claude]`, `[Slack]`
- Parameterized queries for all database operations
- TypeScript strict mode enabled
- Path alias `@/*` maps to project root

## Environment Variables

Required in `.env.local` (not in git):
- `ANTHROPIC_API_KEY` - Claude API
- `GONG_ACCESS_KEY`, `GONG_ACCESS_KEY_SECRET`, `GONG_WEBHOOK_PUBLIC_KEY` - Gong
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob
- `DATABASE_URL`, `DATABASE_URL_UNPOOLED` - Postgres (pooled for app, unpooled for migrations)
- `INTERNAL_API_KEY` - Internal endpoint authentication
- Slack bot token for posting

## Deployment

```bash
cd vercel-app
vercel --prod           # Deploy
vercel env pull         # Pull production env vars for local dev
npm run db:migrate      # Run migrations
```
