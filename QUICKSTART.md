# Quick Start Guide

Get started analyzing your lost deals in minutes!

## Prerequisites

- Node.js 18 or higher installed
- Gong Administrator access (to generate API credentials)
- At least one deal with calls in Gong

## Step 1: Get Gong API Credentials

1. Log in to Gong as an administrator
2. Navigate to: **Admin center > Settings > Ecosystem > API**
3. Click **Get API Key**
4. Copy both:
   - Access Key (username)
   - Access Key Secret (password)

**Keep these credentials secure!**

## Step 2: Install & Configure

```bash
# Clone or navigate to the project
cd anrok-closedlost-bot

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
GONG_ACCESS_KEY=your_access_key_here
GONG_ACCESS_KEY_SECRET=your_access_key_secret_here
EOF
```

**Important**: Replace `your_access_key_here` and `your_access_key_secret_here` with your actual credentials!

## Step 3: Find an Account or Deal ID

You need either an Account ID or Deal ID to sync.

### Finding an Account ID (Easier):
- Open any customer company in Gong
- Look at the URL: `https://app.gong.io/company/1234567890`
- Your Account ID is: `1234567890`

### Finding a Deal ID:
- Open a specific opportunity in Gong
- Look at the URL: `https://app.gong.io/deals/9876543210`
- Your Deal ID is: `9876543210`

**📚 Detailed guide**: See `FINDING_IDS_IN_GONG.md` for more help

## Step 4: Sync Your First Account/Deal

**With Account ID** (gets all calls with that customer):
```bash
npm run sync -- --account-id YOUR_ACCOUNT_ID
```

**Or with Deal ID** (gets calls for specific opportunity):
```bash
npm run sync -- --deal-id YOUR_DEAL_ID
```

This will:
- ✓ Connect to Gong
- ✓ Fetch all calls associated with the deal
- ✓ Download call transcripts
- ✓ Save everything locally in `data/deals/`

Example output:
```
🔄 Starting sync from Gong...
✓ Storage initialized
🔌 Testing Gong connection...
✓ Connected to Gong

📦 Syncing deal: 12345
Fetching calls for deal...
✓ Found 5 call(s)

Fetching transcripts...
  [1/5] Fetching transcript for call abc-123...
  ✓ Transcript retrieved (127 turns)
  ...
```

## Step 5: Run Analysis

```bash
npm run analyze -- --deal-id YOUR_DEAL_ID
```

This will generate analysis prompts in `data/analysis/`:
- `{deal-id}-deal-loss-prompt.md` - Full deal loss analysis
- `{deal-id}-customer-sentiment-prompt.md` - Customer sentiment deep dive
- `{deal-id}-summary.md` - Quick overview

## Step 6: Get AI Insights

1. Open the generated files in `data/analysis/`
2. Copy the content of `{deal-id}-deal-loss-prompt.md`
3. Paste it into ChatGPT (GPT-4) or Claude (Opus/Sonnet)
4. Review the AI's analysis
5. Repeat for the customer sentiment prompt

## Step 7: Learn & Improve

The AI analysis will reveal:
- 🎯 When the deal started going south
- 💬 Real objections vs. stated reasons
- 🚩 Red flags that were missed
- 📊 Customer sentiment evolution
- 💡 Actionable recommendations

## Common Commands

```bash
# Check status and list synced deals
npm run dev status

# Sync a specific deal
npm run sync -- --deal-id 12345

# Analyze a specific deal
npm run analyze -- --deal-id 12345

# Analyze all synced deals
npm run analyze -- --all
```

## Troubleshooting

### "Failed to connect to Gong"
- Verify your API credentials in `.env`
- Ensure you have Gong Administrator access
- Check your internet connection

### "No transcript found for call"
- Some calls may not have transcripts if recording was off
- The analysis will still work with available transcripts

### "Deal not found"
- Make sure you've run `sync` before `analyze`
- Check the deal ID is correct
- Verify the deal exists in Gong

## Next Steps

Once you've analyzed a few deals:
1. Look for patterns across multiple lost deals
2. Share insights with your sales team
3. Adjust your sales process based on findings
4. Consider adding more data sources (Salesforce, email, etc.)

## Getting Help

- Review the main README.md for architecture details
- Check the generated prompt templates in `prompts/`
- Examine the analysis output format for guidance

---

Happy analyzing! 🚀

