# Anrok Deal Analyzer - Production App

Production Vercel application that receives Gong webhooks, imports emails, analyzes deals with Claude AI, and posts insights to Slack.

## Features

- ✅ **Gong Webhook Integration** - Automatic call ingestion
- ✅ **Email Import** - Manual email association with deals
- ✅ **Claude AI Analysis** - Automated deal insights
- ✅ **Slack Integration** - Threaded analysis posts
- ✅ **Hybrid Storage** - Postgres for metadata, Blob for content
- ✅ **Smart Prompts** - Different analysis for active vs. lost deals

## Quick Start

### 1. Deploy to Vercel

```bash
cd vercel-app
npm install
vercel deploy
```

### 2. Set Up Database

In Vercel dashboard:
- Create Postgres database
- Enable Blob storage
- Run migration:

```bash
npm run db:migrate
```

### 3. Configure Environment Variables

In Vercel dashboard, add:

```
ANTHROPIC_API_KEY=sk-ant-...
GONG_ACCESS_KEY=...
GONG_ACCESS_KEY_SECRET=...
GONG_WEBHOOK_SECRET=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C...
```

### 4. Set Up Gong Webhook

1. Go to Gong Admin → Settings → Webhooks
2. Add new webhook: `https://your-app.vercel.app/api/gong-webhook`
3. Select event: "Call processed" or "Transcript ready"
4. Copy webhook secret to env vars

### 5. Set Up Slack App

1. Create app at api.slack.com/apps
2. Add scopes: `chat:write`, `files:write`
3. Install to workspace
4. Copy bot token
5. Invite bot to channel

## API Endpoints

### POST /api/gong-webhook
Receives Gong call webhooks automatically.

**Webhook will**:
- Store call transcript in Blob
- Create/update deal records
- Link call to CRM opportunities
- Trigger analysis (future)

### POST /api/import-emails
Import emails manually.

**Request**:
```json
{
  "emails": [
    {
      "crmId": "006PP00000OjGVqYAN",
      "subject": "Re: Proposal questions",
      "from": "customer@company.com",
      "to": "sales@anrok.com",
      "timestamp": "2025-11-15T10:00:00Z",
      "body": "Email content here..."
    }
  ],
  "triggerAnalysis": true
}
```

### POST /api/analyze-deal
Trigger analysis for a specific deal.

**Request**:
```json
{
  "crmId": "006PP00000OjGVqYAN"
}
```

**OR**:
```json
{
  "dealId": "uuid-here"
}
```

**Response**:
- Executive summary
- Next steps
- Slack thread link
- Analysis ID

### POST /api/post-to-slack
Post analysis to Slack (usually called automatically).

**Request**:
```json
{
  "dealId": "uuid"
}
```

## Architecture

```
Gong Webhook → API Route → Fetch Transcript → Store in Blob
                        ↓
              Create Deal + Interaction Records in Postgres
                        ↓
              Trigger Analysis → Fetch All Interactions
                        ↓
              Retrieve Content from Blob → Format Context
                        ↓
              Send to Claude API → Parse Response
                        ↓
              Store Analysis → Post to Slack
```

## Data Flow

### When a Gong call is processed:
1. Webhook received at `/api/gong-webhook`
2. Call + transcript fetched from Gong API
3. Transcript uploaded to Vercel Blob
4. Deal upserted (created/updated) in Postgres
5. Interaction record created linking to Blob
6. Returns 200 OK to Gong

### When analysis is triggered:
1. Fetch all interactions for deal (calls + emails)
2. Retrieve content from Blob for each
3. Build chronological context
4. Select prompt based on deal stage
5. Send to Claude API
6. Parse response
7. Store analysis in Postgres
8. Post formatted results to Slack thread

## Database Schema

**deals**: Core deal information from CRM
**interactions**: Calls and emails (metadata only)
**manual_emails**: Imported emails
**analyses**: Claude analysis results with Slack thread refs

See `lib/db/schema.sql` for complete schema.

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Open http://localhost:3000

# Run database migration
npm run db:migrate
```

## Testing

### Test Gong Webhook

```bash
curl -X POST http://localhost:3000/api/gong-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-call-id",
    "eventType": "call.processed",
    "crmOpportunityIds": ["006PP00000OjGVqYAN"]
  }'
```

### Test Email Import

```bash
curl -X POST http://localhost:3000/api/import-emails \
  -H "Content-Type: application/json" \
  -d '{
    "emails": [{
      "crmId": "006PP00000OjGVqYAN",
      "subject": "Test",
      "from": "test@example.com",
      "to": "sales@anrok.com",
      "timestamp": "2025-12-01T10:00:00Z",
      "body": "Test email body"
    }]
  }'
```

### Test Analysis

```bash
curl -X POST http://localhost:3000/api/analyze-deal \
  -H "Content-Type: application/json" \
  -d '{"crmId": "006PP00000OjGVqYAN"}'
```

## Deployment

```bash
# Deploy to production
vercel --prod

# Set environment variables in Vercel dashboard

# Run migration on production database
vercel env pull
npm run db:migrate
```

## Monitoring

- **Vercel Logs**: View in Vercel dashboard
- **Database**: Query in Vercel Postgres console
- **Slack**: Check channel for posted analyses

## Troubleshooting

### Webhook not receiving calls
- Check Gong webhook configuration
- Verify webhook URL is correct
- Check Vercel function logs

### Analysis not posting to Slack
- Verify Slack bot token
- Check bot is in channel
- Check Slack API logs

### Database errors
- Verify schema is created (`npm run db:migrate`)
- Check Postgres connection in Vercel

## Migration from Local MVP

The local MVP in the parent directory can still be used for manual analysis. This production app automates the process via webhooks.

**To migrate existing data** (future feature):
- Export data from local JSON files
- Import via `/api/import-emails` endpoint
- Or manually recreate via database inserts

## Future Enhancements

- Web UI for viewing analyses
- CRM bi-directional sync
- Automatic deal stage detection
- Multiple Slack channels
- Custom prompt builder
- Team notifications

