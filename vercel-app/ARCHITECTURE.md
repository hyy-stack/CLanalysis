# Production Architecture

## Overview

This document describes the production architecture of the Anrok Deal Analyzer running on Vercel.

## System Architecture

```
┌─────────────┐
│    Gong     │────────┐
│  (Webhook)  │        │
└─────────────┘        │
                       ▼
┌─────────────┐   ┌──────────────────┐
│   Manual    │──▶│  Vercel Next.js  │
│   Email     │   │   API Routes     │
│   Import    │   └──────────────────┘
└─────────────┘          │
                         ├─── Store Transcript/Email
                         │         ▼
                         │    ┌──────────────┐
                         │    │ Vercel Blob  │
                         │    │  (Content)   │
                         │    └──────────────┘
                         │
                         ├─── Store Metadata
                         │         ▼
                         │    ┌──────────────┐
                         │    │   Postgres   │
                         │    │ (Relations)  │
                         │    └──────────────┘
                         │
                         ├─── Analyze
                         │         ▼
                         │    ┌──────────────┐
                         │    │  Claude API  │
                         │    │  (Analysis)  │
                         │    └──────────────┘
                         │
                         └─── Post Results
                                  ▼
                             ┌──────────────┐
                             │    Slack     │
                             │   (Thread)   │
                             └──────────────┘
```

## Data Flow

### Inbound: Gong Webhook

```
1. Gong processes call → Sends webhook
2. /api/gong-webhook receives POST
3. Verify webhook signature
4. Extract call ID + CRM IDs
5. Check idempotency (already processed?)
6. Fetch full call + transcript from Gong API
7. Upload transcript JSON to Blob → Get URL
8. Upsert deal(s) in Postgres (by CRM ID)
9. Create interaction record (with blob_url)
10. Return 200 OK to Gong
11. (Later) Trigger analysis asynchronously
```

### Inbound: Email Import

```
1. User POSTs JSON/CSV to /api/import-emails
2. Validate input structure
3. For each email:
   - Upload body to Blob → Get URL
   - Upsert deal by CRM ID
   - Create manual_email record
4. Return import summary
5. Optionally trigger analysis
```

### Processing: Analysis

```
1. Trigger analysis (webhook, manual, or import)
2. Fetch deal from Postgres
3. Fetch all interactions (calls + emails) for deal
4. For each interaction:
   - Retrieve content from Blob
   - Format with timestamp, type, participants
5. Build chronological context
6. Select prompt template (active vs. lost)
7. Fill prompt with deal info + context
8. Call Claude API
9. Parse response into structured sections
10. Store analysis in Postgres
11. Post to Slack
12. Return results
```

### Outbound: Slack

```
1. Format analysis results with Block Kit
2. Post main message to channel
3. Post details in thread:
   - Executive summary
   - Next steps
   - Deal health score (if active)
4. Upload full analysis as file attachment
5. Store thread timestamp in database
```

## Storage Strategy

### Why Hybrid Storage?

**Vercel Postgres** stores:
- Deal metadata (CRM IDs, names, stages, amounts)
- Interaction metadata (IDs, timestamps, types)
- Analysis metadata (summaries, Slack refs)
- All relationships

**Vercel Blob** stores:
- Full call transcripts (JSON, 10-50KB each)
- Email bodies (text, 1-10KB each)
- Large content retrieved only when needed

**Benefits**:
- Keep database queries fast (no huge text fields)
- Cost-effective scaling (Blob cheaper than Postgres)
- Easy to query relationships in SQL
- Simple to retrieve content when analyzing

## Database Design

### Entity Relationships

```
deals (1) ────── (many) interactions
  │
  ├────────────── (many) manual_emails
  │
  └────────────── (many) analyses
```

### Key Indexes

- `deals.crm_id` - Fast CRM lookup
- `interactions.external_id` - Idempotency checks
- `interactions.deal_id, timestamp` - Chronological queries
- `analyses.deal_id, created_at` - Latest analysis

## API Routes

### /api/gong-webhook

**Method**: POST
**Auth**: Webhook signature verification
**Timeout**: 30s (quick response to Gong)
**Idempotent**: Yes (checks external_id)

**Success Response**:
```json
{
  "status": "success",
  "callId": "...",
  "dealsProcessed": 1,
  "dealIds": ["uuid"]
}
```

### /api/import-emails

**Method**: POST
**Auth**: None (internal tool for now)
**Timeout**: 60s
**Batch Size**: Recommended < 100 emails

**Success Response**:
```json
{
  "success": true,
  "imported": 5,
  "failed": 0,
  "errors": [],
  "dealsAffected": 3
}
```

### /api/analyze-deal

**Method**: POST
**Auth**: None (internal for now)
**Timeout**: 60s (Claude can take 10-30s)

**Success Response**:
```json
{
  "success": true,
  "dealId": "uuid",
  "dealName": "Office Practicum",
  "analysisId": "uuid",
  "slackThread": "1234567890.123456",
  "summary": {
    "interactions": 3,
    "emails": 2,
    "execSummary": "..."
  }
}
```

### /api/post-to-slack

**Method**: POST
**Auth**: None (internal)
**Timeout**: 30s

**Success Response**:
```json
{
  "success": true,
  "slackThread": "1234567890.123456",
  "channel": "C0123456789"
}
```

## Error Handling Strategy

### Webhook Errors

**Principle**: Always return 200 to prevent Gong retries

```typescript
try {
  // Process webhook
} catch (error) {
  // Log error
  console.error(error);
  // Return 200 anyway
  return NextResponse.json({ status: 'error', error: error.message }, { status: 200 });
}
```

### Analysis Errors

**Principle**: Graceful degradation

- Claude API fails → Log, return error, don't post to Slack
- Slack API fails → Log, store analysis anyway
- Blob retrieval fails → Skip that interaction, continue

### Database Errors

**Principle**: Fail fast with clear messages

- Connection error → 500 response
- Constraint violation → 400 with details
- Not found → 404

## Security Considerations

### Webhook Authentication

Verify Gong webhook signature:
```typescript
const isValid = verifyGongWebhook(
  requestBody,
  request.headers.get('x-gong-signature'),
  process.env.GONG_WEBHOOK_SECRET
);
```

### SQL Injection Prevention

Use parameterized queries:
```typescript
// Good
await sql`SELECT * FROM deals WHERE crm_id = ${userInput}`;

// Bad - never do this
await sql.query(`SELECT * FROM deals WHERE crm_id = '${userInput}'`);
```

### Blob Access

- Use `access: 'public'` for now (read-only)
- Blobs are essentially immutable
- URLs are opaque/unguessable

## Performance Considerations

### Database

- Indexes on frequently queried fields
- JSONB for flexible metadata
- Separate tables for large collections

### Blob Storage

- Only retrieve when needed
- Stream large files if necessary
- Cache retrieval results if re-analyzing

### API Routes

- Quick response to webhooks (< 30s)
- Async processing for heavy work
- Appropriate timeouts per route

### Claude API

- Typical prompt: ~15-25K tokens
- Typical response: ~3-5K tokens
- Time: 10-30 seconds
- Cost per analysis: ~$0.15

## Scaling Considerations

### Current Limits (Vercel Free/Pro)

- Function timeout: 60s (Pro tier)
- Request body: 4.5MB max
- Concurrent executions: Based on plan

### If Scaling Up

- Add queue for async analysis (Vercel KV + cron)
- Add caching layer for frequent queries
- Consider read replicas for Postgres
- Batch Blob operations

## Monitoring & Observability

### Metrics to Track

- Webhooks received per day
- Analysis run time (p50, p95, p99)
- Claude API latency
- Slack API latency
- Database query performance
- Blob storage usage

### Logging Strategy

- Prefix all logs with component: `[Gong Webhook]`, `[Analysis]`, etc.
- Log key events: received, processing, complete
- Log errors with stack traces
- Include deal/call IDs for traceability

### Alerts (Future)

- Webhook failures spike
- Claude API errors
- Database connection issues
- Slack posting failures

## Cost Management

### Estimated Monthly Costs (100 calls/month)

**Vercel**:
- Hobby tier: $0 (within limits)
- Pro tier: $20/month if needed

**Postgres**:
- Storage: ~$0.25/GB (minimal data)
- Reads: ~$0.02/1M rows (negligible)

**Blob**:
- Storage: ~50MB * $0.15/GB = ~$0.01
- Egress: ~100 analyses * 50KB * $0.20/GB = ~$0.001

**Claude API**:
- 100 analyses * $0.15 = ~$15/month

**Total**: ~$15-35/month

## Future Architecture Improvements

- Add caching layer (Redis/Vercel KV)
- Background job queue for analysis
- Webhook retry logic
- Multi-tenant support
- Real-time updates via WebSockets
- Admin dashboard UI

