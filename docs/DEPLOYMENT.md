# Deployment Guide

Step-by-step guide to deploy the Anrok Deal Analyzer to Vercel.

## Prerequisites

- [x] Vercel account
- [x] Anthropic API key
- [x] Gong Admin access
- [x] Slack workspace admin access

## Step 1: Deploy to Vercel

### Option A: Via Vercel CLI

```bash
cd vercel-app

# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

### Option B: Via GitHub

1. Push code to GitHub
2. Import project in Vercel dashboard
3. Deploy automatically

## Step 2: Set Up Vercel Postgres

1. Go to your project in Vercel dashboard
2. Navigate to **Storage** tab
3. Click **Create Database**
4. Select **Postgres**
5. Click **Create**

Vercel will automatically set these environment variables:
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`

## Step 3: Set Up Vercel Blob

1. In Vercel dashboard → **Storage** tab
2. Click **Create Database**
3. Select **Blob**
4. Click **Create**

Vercel will automatically set:
- `BLOB_READ_WRITE_TOKEN`

## Step 4: Run Database Migration

```bash
# Pull environment variables locally
vercel env pull .env.local

# Run migration
npm run db:migrate
```

Or run in Vercel:
1. Go to **Deployments** tab
2. Find latest deployment
3. Click **...** → **Run Command**
4. Enter: `node scripts/migrate.js`

## Step 5: Configure Environment Variables

In Vercel dashboard → **Settings** → **Environment Variables**, add:

### Anthropic Claude API

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Get from: https://console.anthropic.com/

### Gong API

```
GONG_ACCESS_KEY=your_access_key
GONG_ACCESS_KEY_SECRET=your_secret
GONG_WEBHOOK_SECRET=your_webhook_secret
```

Get from: Gong Admin → Settings → Ecosystem → API

### Slack Bot

```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_ID=C0123456789
```

Get from: https://api.slack.com/apps

## Step 6: Set Up Slack App

### Create App

1. Go to https://api.slack.com/apps
2. Click **Create New App**
3. Choose **From scratch**
4. Name: "Anrok Deal Analyzer"
5. Select your workspace

### Configure Scopes

1. Go to **OAuth & Permissions**
2. Under **Bot Token Scopes**, add:
   - `chat:write`
   - `files:write`
   - `channels:read`
3. Click **Install to Workspace**
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
5. Add to Vercel environment variables as `SLACK_BOT_TOKEN`

### Invite Bot to Channel

1. Open the Slack channel where you want analyses posted
2. Type `/invite @Anrok Deal Analyzer`
3. Copy the channel ID from the URL:
   - URL: `https://app.slack.com/client/T.../C0123456789`
   - Channel ID: `C0123456789`
4. Add to Vercel as `SLACK_CHANNEL_ID`

## Step 7: Configure Gong Webhook

1. Log in to Gong as admin
2. Go to **Admin center** → **Settings** → **Ecosystem** → **Webhooks**
3. Click **Add Webhook**
4. Configure:
   - **URL**: `https://your-app.vercel.app/api/gong-webhook`
   - **Events**: Select "Call processed" or "Transcript ready"
   - **Filters**: 
     - Call scope: External
     - Min duration: 300 seconds (5 minutes)
   - **Secret**: Generate a secret key
5. Save webhook
6. Copy the secret to Vercel as `GONG_WEBHOOK_SECRET`

## Step 8: Verify Deployment

### Test Webhook Endpoint

```bash
curl https://your-app.vercel.app/api/gong-webhook
```

Should return method not allowed (we only accept POST).

### Test Email Import

```bash
curl -X POST https://your-app.vercel.app/api/import-emails \
  -H "Content-Type: application/json" \
  -d '{
    "emails": [{
      "crmId": "test-crm-id",
      "subject": "Test",
      "from": "test@example.com",
      "to": "sales@anrok.com",
      "timestamp": "2025-12-01T10:00:00Z",
      "body": "Test email"
    }]
  }'
```

### Check Vercel Logs

1. Go to **Deployments** → Latest deployment
2. Click **Functions** tab
3. View logs for each API route

## Step 9: Test with Real Data

### Option A: Wait for Gong Call

After the webhook is configured, Gong will automatically send webhooks when calls are processed.

### Option B: Trigger Manual Analysis

If you already have call data, trigger analysis manually:

```bash
curl -X POST https://your-app.vercel.app/api/analyze-deal \
  -H "Content-Type: application/json" \
  -d '{"crmId": "006PP00000OjGVqYAN"}'
```

## Troubleshooting

### Database Connection Errors

**Problem**: "Cannot connect to database"

**Solution**:
- Verify Postgres database is created in Vercel
- Check environment variables are set
- Run migration script

### Webhook Not Working

**Problem**: Gong webhook failing

**Solution**:
- Check webhook URL is correct
- Verify function is deployed
- Check Vercel function logs
- Test webhook signature verification

### Slack Not Posting

**Problem**: Analysis not appearing in Slack

**Solution**:
- Verify bot token is correct
- Check bot is invited to channel
- Verify channel ID is correct
- Check Slack API permissions

### Claude API Errors

**Problem**: "Invalid API key" or timeouts

**Solution**:
- Verify Anthropic API key
- Check API rate limits
- Ensure sufficient credits

## Monitoring

### Check Recent Analyses

Query database:
```sql
SELECT d.name, a.analysis_type, a.created_at 
FROM analyses a
JOIN deals d ON a.deal_id = d.id
ORDER BY a.created_at DESC
LIMIT 10;
```

### View Slack Posts

Check your configured Slack channel for analysis threads.

### Vercel Dashboard

- **Functions**: View API route invocations
- **Logs**: Real-time logging
- **Analytics**: Request metrics

## Costs

**Vercel**:
- Free tier: 100GB-hours compute/month
- Postgres: $0.25/GB storage + $0.02/1M rows read
- Blob: $0.15/GB storage + $0.20/GB egress

**Claude API**:
- Sonnet 3.5: ~$3 per million tokens input, $15 per million output
- Typical analysis: ~20K tokens input, ~5K output = ~$0.15/analysis

**Slack**: Free

## Security

- All API routes check authentication
- Gong webhooks verify signature
- Database uses parameterized queries
- Blob storage uses secure URLs
- Environment variables never exposed

## Next Steps

After deployment:
1. Monitor webhook calls in Vercel logs
2. Verify first analysis posts to Slack
3. Import historical emails if needed
4. Set up alerts for errors
5. Review and refine prompts based on results

