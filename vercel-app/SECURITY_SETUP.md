# Security Setup Guide

Complete guide to securing your Anrok Deal Analyzer deployment.

## Overview

Phase 1 security protects against:
- ✅ Fake Gong webhooks (signature verification)
- ✅ Fake Slack interactions (signature + replay attack prevention)
- ✅ Unauthorized API access (API key for manual endpoints)
- ✅ Cost abuse (someone spamming expensive Claude API calls)

## Step 1: Generate Secrets

### 1.1 Generate Gong Webhook Secret
```bash
openssl rand -hex 32
# Example output: 4a8f3c2b1d9e7f6a5c4b3d2e1f0a9b8c...
```

**Copy this** - you'll need it for both Gong and Vercel

### 1.2 Generate Internal API Key
```bash
openssl rand -hex 32
# Example output: 7b9e4d1a8c5f2b6d3e7a9c1f4b8d2e6a...
```

**Keep this secure** - this is YOUR key for triggering analyses

## Step 2: Add to Vercel

Go to **Vercel Dashboard** → **anrok-deal-analyzer** → **Settings** → **Environment Variables**

Add these THREE new variables:

| Variable | Value | Where to Get It |
|----------|-------|-----------------|
| `GONG_WEBHOOK_SECRET` | From Step 1.1 | YOU generated it |
| `SLACK_SIGNING_SECRET` | From Slack app | See Step 3 below |
| `INTERNAL_API_KEY` | From Step 1.2 | YOU generated it |

**Important**: Select **Production** environment for all three.

## Step 3: Configure Gong Webhook

1. Log in to Gong as admin
2. Go to **Admin** → **Settings** → **Webhooks**
3. Find your existing webhook (or create new):
   - **URL**: `https://anrok-deal-analyzer.vercel.app/api/gong-webhook`
   - **Secret**: Paste the secret from Step 1.1 (same one in Vercel)
   - **Events**: Call processed / Transcript ready
4. **Save**

**Important**: Use the SAME secret in both Gong and Vercel!

## Step 4: Get Slack Signing Secret

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Select **Anrok Deal Analyzer** app
3. Click **Basic Information** in left sidebar
4. Scroll to **App Credentials**
5. Copy the **Signing Secret** (NOT the Client Secret)
6. Add to Vercel as `SLACK_SIGNING_SECRET`

## Step 5: Redeploy

After adding all environment variables:

```bash
cd vercel-app
git pull  # Get latest security changes
npx vercel --prod
```

Or in Vercel Dashboard:
- **Deployments** → Latest → **...** → **Redeploy**

## Step 6: Test Security

### Test 1: Gong Webhook (Should Reject Without Signature)
```bash
# This should fail with 401
curl -X POST https://anrok-deal-analyzer.vercel.app/api/gong-webhook \
  -H "Content-Type: application/json" \
  -d '{"callId": "test"}'

# Expected: {"error": "Missing signature"}
```

### Test 2: Analyze Deal (Should Require API Key)
```bash
# Without API key - should fail
curl -X POST https://anrok-deal-analyzer.vercel.app/api/analyze-deal \
  -d '{"crmId": "TEST-002"}'

# Expected: {"error": "Unauthorized"}

# With API key - should work
curl -X POST https://anrok-deal-analyzer.vercel.app/api/analyze-deal \
  -H "X-API-Key: your-key-from-step-1.2" \
  -d '{"crmId": "TEST-002"}'

# Expected: {"success": true, ...}
```

### Test 3: Import Emails (Should Require API Key)
```bash
# Without key - should fail
curl -X POST https://anrok-deal-analyzer.vercel.app/api/import-emails \
  -d '{"emails": []}'

# Expected: {"error": "Unauthorized"}
```

## Using the API Key

### For Scripts/Manual Triggers

Save your API key locally:
```bash
# In your .env.local or shell profile
export ANROK_API_KEY=your-key-from-step-1.2
```

Use in curl commands:
```bash
curl -X POST https://anrok-deal-analyzer.vercel.app/api/analyze-deal \
  -H "X-API-Key: $ANROK_API_KEY" \
  -d '{"crmId": "006PP..."}'
```

Or in JavaScript/TypeScript:
```typescript
fetch('https://anrok-deal-analyzer.vercel.app/api/analyze-deal', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.ANROK_API_KEY,
  },
  body: JSON.stringify({ crmId: '006PP...' }),
});
```

## What's Protected Now

| Endpoint | Auth Method | Purpose |
|----------|-------------|---------|
| `/api/gong-webhook` | Gong HMAC signature | Prevents fake webhooks |
| `/api/slack-interactions` | Slack signature + timestamp | Prevents fake button clicks |
| `/api/analyze-deal` | API key | Prevents unauthorized analysis |
| `/api/import-emails` | API key | Prevents unauthorized imports |
| `/api/view-deal` | None (read-only) | Public data view |

## Security FAQ

**Q: Where do I store my API key?**
A: In your password manager, .env.local file (gitignored), or shell profile. Never commit to git.

**Q: Can I have multiple API keys?**
A: For MVP, we only support one. For multi-user, you'd need a proper auth system.

**Q: What if my API key is compromised?**
A: Generate a new one, update Vercel environment variable, redeploy.

**Q: Why does view-deal not require auth?**
A: It's read-only. You could add API key if sensitive, but deal IDs are already hard to guess.

**Q: Can I disable auth for development?**
A: Yes, set `INTERNAL_API_KEY=dev` in development env and use `-H "X-API-Key: dev"` for testing.

## Monitoring

After implementing security:

**Check Vercel function logs** for:
- 401 errors (rejected requests)
- Missing signature warnings
- Replay attack blocks

**What to alert on**:
- Spike in 401 errors (someone trying to abuse)
- Missing SLACK_SIGNING_SECRET errors (config issue)
- Invalid Gong signatures (Gong config issue)

## Next Steps

1. ✅ Generate all secrets (Step 1)
2. ✅ Add to Vercel (Step 2)
3. ✅ Configure Gong webhook secret (Step 3)
4. ✅ Get Slack signing secret (Step 4)
5. ✅ Redeploy (Step 5)
6. ✅ Test (Step 6)

Once complete, your production system will be secure against common attacks and abuse!

## Troubleshooting

**"Invalid signature" from Gong**:
- Check secret matches in both Gong and Vercel
- Verify header name (check logs)
- Test with Gong's "Test Webhook" button

**"Invalid signature" from Slack**:
- Check you're using Signing Secret (not Client Secret)
- Verify it's in Vercel env vars
- Check timestamp isn't skewed

**"Unauthorized" when YOU trigger analysis**:
- Check X-API-Key header is included
- Verify key matches Vercel env var
- Check for trailing spaces in key

---

**Security Status**: ✅ **Production-Ready** after Phase 1

