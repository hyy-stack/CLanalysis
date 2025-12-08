# Quick Start - Deploy to Vercel in 30 Minutes

Get your Anrok Deal Analyzer running on Vercel production.

## Prerequisites

- [Vercel account](https://vercel.com/signup) (free tier works)
- [Anthropic API key](https://console.anthropic.com/) ($20 credit to start)
- Gong Admin access (for webhook setup)
- Slack workspace admin (for bot creation)

## Step 1: Deploy to Vercel (3 minutes)

### Option A: Deploy via Vercel Dashboard (Recommended)

1. Go to [vercel.com/new](https://vercel.com/new)
2. **Import Git Repository**:
   - Connect your GitHub/GitLab
   - Select this repository
   - **Root Directory**: Set to `vercel-app`
3. Click **Deploy**
4. Wait ~2 minutes for build

Your app is live at: `https://your-project.vercel.app`

### Option B: Deploy via CLI

```bash
cd vercel-app

# Install Vercel CLI (if not already installed)
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod

# Note the deployment URL
```

## Step 2: Create Postgres Database (2 minutes)

In Vercel dashboard for your project:

1. Click **Storage** tab
2. Click **Create Database**
3. Select **Postgres**
4. Name: `anrok-deals` (or any name)
5. Region: Select closest to you
6. Click **Create**

Wait ~1 minute for provisioning. Vercel automatically adds these environment variables:
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`

## Step 3: Create Blob Storage (1 minute)

Still in **Storage** tab:

1. Click **Create Database** again
2. Select **Blob**
3. Click **Create**

Vercel automatically adds:
- `BLOB_READ_WRITE_TOKEN`

## Step 4: Run Database Migration (2 minutes)

In Vercel dashboard:

1. Go to **Deployments** tab
2. Click on your latest deployment
3. Scroll down to **Deployment Details**
4. Click **...** (three dots) → **Redeploy**
5. Select **Use existing Build Cache**
6. Once redeployed, go to **Functions** tab
7. Or use CLI:

```bash
# Pull environment variables
cd vercel-app
vercel env pull

# Run migration
npm install
npm run db:migrate
```

**Verify**: Database tables created successfully

## Step 5: Get Anthropic API Key (2 minutes)

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Click **API Keys** in left sidebar
4. Click **Create Key**
5. Name it "Anrok Deal Analyzer"
6. Copy the key (starts with `sk-ant-`)
7. **Keep this safe** - you'll add it to Vercel next

## Step 6: Set Up Slack Bot (5 minutes)

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App**
3. Select **From scratch**
4. App Name: "Anrok Deal Analyzer"
5. Select your workspace → **Create App**

6. **Add Bot Scopes**:
   - Click **OAuth & Permissions** in sidebar
   - Scroll to **Scopes** → **Bot Token Scopes**
   - Click **Add an OAuth Scope**
   - Add: `chat:write`, `files:write`, `channels:read`

7. **Install App**:
   - Scroll up to **OAuth Tokens**
   - Click **Install to Workspace**
   - Click **Allow**
   - Copy the **Bot User OAuth Token** (starts with `xoxb-`)

8. **Get Channel ID**:
   - Open Slack, go to the channel for analyses
   - Invite the bot: Type `/invite @Anrok Deal Analyzer`
   - Click on channel name → Scroll down
   - Copy **Channel ID** (or from URL: `C0123456789`)

## Step 7: Add Environment Variables to Vercel (3 minutes)

In Vercel dashboard → Your Project → **Settings** → **Environment Variables**:

Click **Add New** for each:

| Key | Value | Notes |
|-----|-------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | From Step 5 |
| `GONG_ACCESS_KEY` | Your Gong key | Already have this |
| `GONG_ACCESS_KEY_SECRET` | Your Gong secret | Already have this |
| `GONG_WEBHOOK_SECRET` | `any-random-string-123` | Create a random secret |
| `SLACK_BOT_TOKEN` | `xoxb-...` | From Step 6 |
| `SLACK_CHANNEL_ID` | `C0123456789` | From Step 6 |

**Important**: Select **Production** environment for all variables

Then click **Redeploy** in Deployments tab

## Step 8: Configure Gong Webhook (3 minutes)

1. Log in to Gong as admin
2. Navigate to **Admin center** → **Settings** → **Ecosystem** → **Webhooks**
3. Click **Add Webhook** (or **Create Webhook**)
4. Configure:
   - **Webhook URL**: `https://your-project.vercel.app/api/gong-webhook`
   - **Events**: Select "Call Processed" or "Transcript Ready"
   - **Filters** (optional but recommended):
     - Call scope: **External**
     - Minimum duration: **300 seconds** (5 minutes)
   - **Secret**: Use the same random string from Step 7 (`GONG_WEBHOOK_SECRET`)
5. Click **Save** or **Create**

Gong will now send webhooks to your Vercel app automatically!

## Step 9: Test It! (5 minutes)

### Test 1: Import a Test Email

Replace `your-project.vercel.app` with your actual URL:

```bash
curl -X POST https://your-project.vercel.app/api/import-emails \
  -H "Content-Type: application/json" \
  -d '{
    "emails": [{
      "crmId": "TEST-001",
      "subject": "Test Email - Pricing Question",
      "from": "customer@testcompany.com",
      "to": "sales@anrok.com",
      "timestamp": "2025-12-01T10:00:00Z",
      "body": "Thank you for the proposal. We have some questions about the pricing tiers and implementation timeline. Can we schedule a call to discuss?"
    }]
  }'
```

**Expected**: `{ "success": true, "imported": 1, ... }`

### Test 2: Trigger Analysis

```bash
curl -X POST https://your-project.vercel.app/api/analyze-deal \
  -H "Content-Type: application/json" \
  -d '{"crmId": "TEST-001"}'
```

**Expected**: Analysis runs, Claude generates insights

### Test 3: Check Slack

1. Open your configured Slack channel
2. You should see: **"📊 Analysis: [Deal Name]"**
3. Click the message to view thread
4. See executive summary and next steps
5. Check for file attachment with full analysis

**If it works**: 🎉 Your system is live!

## Verification Checklist

Check off each item:

**Deployment**:
- [ ] App deployed and showing at `https://your-project.vercel.app`
- [ ] Can access homepage (shows API endpoints)

**Storage**:
- [ ] Postgres database created in Vercel Storage tab
- [ ] Blob storage enabled in Vercel Storage tab
- [ ] Migration run successfully (tables created)

**Configuration**:
- [ ] All 6 environment variables added to Vercel
- [ ] Redeployed after adding variables

**Integrations**:
- [ ] Slack bot created and installed
- [ ] Bot invited to channel
- [ ] Gong webhook created and pointing to your URL

**Testing**:
- [ ] Test email import returns success
- [ ] Test analysis completes
- [ ] Slack post appears in channel
- [ ] Can view thread with details

## ✅ You're Done!

If all checkboxes are checked, your production system is live!

## Step 10: What Happens Next (Ongoing)

### Automatic (Once Webhook is Live)

Every time a call is processed in Gong:
1. ✅ Webhook sent to your Vercel app
2. ✅ Transcript fetched and stored in Blob
3. ✅ Deal created/updated in Postgres
4. ✅ Interaction record created

### Manual (For Now)

To trigger analysis:
```bash
# For any deal with interactions
curl -X POST https://your-project.vercel.app/api/analyze-deal \
  -H "Content-Type: application/json" \
  -d '{"crmId": "YOUR-CRM-OPPORTUNITY-ID"}'
```

To import emails:
```bash
curl -X POST https://your-project.vercel.app/api/import-emails \
  -H "Content-Type: application/json" \
  -d @emails.json
```

### In Slack

Check your configured channel for:
- **Main message**: "📊 Analysis: [Deal Name]"
- **Thread**: Executive summary, next steps, deal health
- **File**: Full detailed analysis

## Real-World Usage

### After First Gong Call Comes In

1. Check Vercel **Functions** logs to see webhook received
2. Query database to verify data stored:
   ```sql
   SELECT * FROM deals ORDER BY created_at DESC LIMIT 5;
   SELECT * FROM interactions ORDER BY created_at DESC LIMIT 5;
   ```
3. Trigger analysis for that deal
4. Review Slack post
5. Iterate on prompts if needed

### Daily Workflow

1. Calls happen → Gong webhooks → Data stored automatically
2. End of day: Trigger analysis for active deals
3. Review Slack threads for insights
4. Take action on warnings/next steps

## Troubleshooting

### "Database connection failed"
→ Check Postgres created in Vercel
→ Run migration script

### "Analysis not posting to Slack"
→ Check bot token
→ Verify bot is in channel
→ Check channel ID

### "Webhook not receiving calls"
→ Check webhook URL
→ Verify Gong webhook configured
→ Check function logs in Vercel

## Next Steps

1. Wait for first real Gong call (or test with existing call ID)
2. Import historical emails if needed
3. Trigger analysis for active deals
4. Review Slack posts
5. Refine prompts based on results

**Congratulations!** Your production deal analyzer is live! 🎉

