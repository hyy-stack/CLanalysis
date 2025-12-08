# Anrok Deal Analyzer

A production-ready Vercel application that automatically analyzes sales deals by receiving Gong call webhooks, analyzing conversations with Claude AI, and posting insights to Slack.

## Features

- ✅ **Gong Webhook Integration** - Automatic call ingestion
- ✅ **Email Import** - Manual email association with deals
- ✅ **Claude AI Analysis** - Automated deal insights
- ✅ **Slack Integration** - Threaded analysis posts
- ✅ **Hybrid Storage** - Postgres for metadata, Blob for content
- ✅ **Smart Prompts** - Different analysis for active vs. lost deals

## Quick Start

See **[docs/QUICKSTART.md](docs/QUICKSTART.md)** for a complete 30-minute deployment guide.

### tl;dr

\`\`\`bash
cd vercel-app
npm install
vercel deploy
# Set up Postgres + Blob in Vercel dashboard
# Add environment variables
# Configure Gong webhook
# Set up Slack bot
\`\`\`

## Architecture

**Hybrid Storage**:
- **Vercel Postgres**: Deal metadata, relationships, analysis results
- **Vercel Blob**: Call transcripts, email bodies

**AI-Powered**:
- **Claude 3.5 Sonnet**: Analyzes conversations
- **Smart Prompts**: Different analysis for active vs. lost deals
- **Structured Output**: Executive summary, next steps, details

**Team Sharing**:
- **Slack Threads**: Formatted analysis posts
- **Automatic**: Posts after analysis completes
- **Organized**: Main message + detailed thread

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for technical details.

## API Endpoints

### POST /api/gong-webhook
Receives Gong call webhooks automatically.

**Webhook will**:
- Store call transcript in Blob
- Create/update deal records
- Link call to CRM opportunities
- Trigger analysis automatically

### POST /api/import-emails
Import emails manually.

**Request**:
\`\`\`json
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
\`\`\`

### POST /api/analyze-deal
Trigger analysis for a specific deal.

**Request**:
\`\`\`json
{
  "crmId": "006PP00000OjGVqYAN"
}
\`\`\`

**OR**:
\`\`\`json
{
  "dealId": "uuid-here"
}
\`\`\`

**Response**:
- Executive summary
- Next steps
- Slack thread link
- Analysis ID

### POST /api/backfill-deal
Backfill historical calls for a deal.

**Request**:
\`\`\`json
{
  "crmId": "006PP00000OjGVqYAN",
  "callIds": ["6226038272614881523"],
  "autoAnalyze": true
}
\`\`\`

## File Structure

\`\`\`
vercel-app/
├── app/api/          # API route handlers
├── lib/              # Core business logic
│   ├── db/           # Postgres operations
│   ├── blob/         # Blob storage
│   ├── claude/       # AI integration
│   ├── slack/        # Slack posting
│   ├── gong/         # Gong API + webhooks
│   └── analysis/     # Context building
├── prompts/          # Analysis prompts
├── types/            # TypeScript types
└── scripts/          # Database migrations
\`\`\`

## Documentation

- 📖 **[docs/QUICKSTART.md](docs/QUICKSTART.md)** - 30-minute deployment guide
- 📖 **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Detailed deployment steps
- 📖 **[docs/TESTING.md](docs/TESTING.md)** - How to test everything
- 📖 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Technical deep dive
- 📖 **[docs/SECURITY_SETUP.md](docs/SECURITY_SETUP.md)** - Security configuration
- 📖 **[docs/SLACK_SETUP.md](docs/SLACK_SETUP.md)** - Slack bot setup
- 📖 **[docs/MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md)** - Migration reference
- 📖 **[docs/FINDING_IDS_IN_GONG.md](docs/FINDING_IDS_IN_GONG.md)** - Finding Gong IDs
- 📖 **[docs/GONG_ACCESS_GUIDE.md](docs/GONG_ACCESS_GUIDE.md)** - Gong API access

## Development

\`\`\`bash
cd vercel-app

# Install dependencies
npm install

# Run locally
npm run dev

# Open http://localhost:3000

# Run database migration
npm run db:migrate
\`\`\`

## Testing

### Test Gong Webhook

\`\`\`bash
curl -X POST http://localhost:3000/api/gong-webhook \\
  -H "Content-Type: application/json" \\
  -d '{
    "callId": "test-call-id",
    "eventType": "call.processed",
    "crmOpportunityIds": ["006PP00000OjGVqYAN"]
  }'
\`\`\`

### Test Email Import

\`\`\`bash
curl -X POST http://localhost:3000/api/import-emails \\
  -H "Content-Type: application/json" \\
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
\`\`\`

### Test Analysis

\`\`\`bash
curl -X POST http://localhost:3000/api/analyze-deal \\
  -H "Content-Type: application/json" \\
  -d '{"crmId": "006PP00000OjGVqYAN"}'
\`\`\`

## Deployment

\`\`\`bash
# Deploy to production
cd vercel-app
vercel --prod

# Set environment variables in Vercel dashboard

# Run migration on production database
vercel env pull
npm run db:migrate
\`\`\`

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for detailed steps.

## Current State

✅ **Fully implemented** - All code complete  
✅ **Ready to deploy** - Just needs Vercel + config  
✅ **Production-ready** - Error handling, logging, security

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
- Verify schema is created (\`npm run db:migrate\`)
- Check Postgres connection in Vercel

For more help, see the [documentation](docs/).
