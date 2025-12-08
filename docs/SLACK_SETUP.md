# Slack App Setup Guide

Quick guide to set up the Anrok Deal Analyzer Slack bot using the app manifest.

## Quick Setup with Manifest (Recommended - 2 minutes)

### 1. Create App from Manifest

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App**
3. Select **From an app manifest**
4. Choose your workspace
5. Click **Next**

### 2. Paste Manifest

1. Select **JSON** tab
2. Copy the entire contents of `slack-app-manifest.json` from this directory
3. Paste it into the text box
4. Click **Next**
5. Review the configuration:
   - **App Name**: Anrok Deal Analyzer
   - **Bot Scopes**: chat:write, files:write, channels:read
6. Click **Create**

### 3. Install to Workspace

1. Click **Install to Workspace**
2. Review permissions
3. Click **Allow**

### 4. Get Bot Token

1. Go to **OAuth & Permissions** in the left sidebar
2. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
3. Save this for your environment variables

### 5. Invite Bot to Channel

1. Open Slack
2. Go to the channel where you want analysis posted
3. Type: `/invite @Anrok Deal Analyzer`
4. Press Enter

### 6. Get Channel ID

**Option A: From URL**
1. Open the channel in Slack
2. Look at the URL: `https://app.slack.com/client/T.../C0123456789`
3. The `C0123456789` part is your Channel ID

**Option B: From Channel Details**
1. Click on the channel name at the top
2. Scroll down to the bottom
3. Copy the Channel ID

## Add to Vercel

In Vercel Dashboard → **anrok-deal-analyzer** → **Settings** → **Environment Variables**:

```
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_CHANNEL_ID=C0123456789
```

Select **Production** environment and click **Save**.

## Manual Setup (Alternative - 5 minutes)

If you prefer not to use the manifest:

### 1. Create App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name: "Anrok Deal Analyzer"
4. Select workspace → **Create**

### 2. Add Bot Scopes

1. Go to **OAuth & Permissions**
2. Scroll to **Bot Token Scopes**
3. Click **Add an OAuth Scope**
4. Add these scopes:
   - `chat:write` - Post messages
   - `files:write` - Upload analysis files
   - `channels:read` - Read channel info

### 3. Install & Configure

1. Click **Install to Workspace**
2. Copy the Bot User OAuth Token
3. Invite bot to your channel: `/invite @Anrok Deal Analyzer`
4. Get channel ID from URL or channel details

## Testing the Bot

After setup, test that the bot can post:

```bash
curl -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer xoxb-your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "C0123456789",
    "text": "Test message from Anrok Deal Analyzer"
  }'
```

Should return: `{"ok": true, ...}`

## What the Bot Will Post

When analysis runs, the bot will:
1. **Post main message**: "📊 Analysis: [Deal Name]"
2. **Create thread** with:
   - Executive Summary
   - Next Steps
   - Deal Health Score (for active deals)
3. **Upload file** with full detailed analysis

## Troubleshooting

### "not_in_channel" error
→ Invite the bot: `/invite @Anrok Deal Analyzer`

### "invalid_auth" error
→ Check bot token is correct
→ Verify token starts with `xoxb-`

### "channel_not_found" error
→ Check channel ID is correct
→ Ensure bot is invited to channel

## App Permissions Summary

| Permission | Purpose |
|------------|---------|
| `chat:write` | Post analysis messages and threads |
| `files:write` | Upload full analysis as file attachment |
| `channels:read` | Read channel information |

## Next Steps

Once Slack is configured:
1. Add bot token and channel ID to Vercel env vars
2. Redeploy your app
3. Test with a deal analysis
4. Check your Slack channel for the post!

