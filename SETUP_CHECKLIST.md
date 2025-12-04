# Setup Checklist

Use this checklist to ensure everything is configured correctly.

## ✅ Prerequisites

- [ ] Node.js 18+ installed
  ```bash
  node --version  # Should be 18.x or higher
  ```

- [ ] Gong Administrator access (or credentials from admin)

- [ ] At least one lost/closed deal with calls in Gong

## ✅ Installation

- [ ] Navigate to project directory
  ```bash
  cd anrok-closedlost-bot
  ```

- [ ] Install dependencies
  ```bash
  npm install
  ```

- [ ] Verify installation (no errors)

## ✅ Gong API Setup

- [ ] Log in to Gong as administrator

- [ ] Navigate to: Admin center > Settings > Ecosystem > API

- [ ] Click "Get API Key"

- [ ] Copy Access Key (looks like: `abc123xyz...`)

- [ ] Copy Access Key Secret (looks like: `secret456def...`)

- [ ] ⚠️ Save credentials securely (shown only once!)

## ✅ Environment Configuration

- [ ] Create `.env` file in project root
  ```bash
  touch .env
  ```

- [ ] Add Gong credentials to `.env`:
  ```
  GONG_ACCESS_KEY=your_access_key_here
  GONG_ACCESS_KEY_SECRET=your_access_key_secret_here
  ```

- [ ] Replace placeholder values with actual credentials

- [ ] Verify `.env` is in `.gitignore` (it is by default)

- [ ] Optional: Configure deal stages filter
  ```
  DEAL_STAGES_TO_ANALYZE=closed_lost,stalled,no_decision
  ```

## ✅ Test Connection

- [ ] Run status command to verify setup
  ```bash
  npm run dev status
  ```

- [ ] Should see "No sync performed yet" (this is OK)

- [ ] No errors about missing credentials

## ✅ Find a Deal ID

Choose one method:

**Option 1: From Gong URL**
- [ ] Open a deal in Gong
- [ ] Copy ID from URL: `https://app.gong.io/deals/12345`
- [ ] Deal ID is: `12345`

**Option 2: From CRM**
- [ ] Open opportunity in Salesforce/HubSpot
- [ ] Copy Opportunity ID
- [ ] This is often the Gong deal ID

**Option 3: Ask Your Team**
- [ ] Contact sales ops or RevOps
- [ ] Request deal IDs for recent lost deals

## ✅ First Sync

- [ ] Run sync with your deal ID
  ```bash
  npm run sync -- --deal-id YOUR_DEAL_ID
  ```

- [ ] Should see:
  - ✓ "Connected to Gong"
  - ✓ "Found X call(s)"
  - ✓ "Retrieved X transcript(s)"
  - ✓ "Data saved successfully"

- [ ] Check data directory was created
  ```bash
  ls -la data/deals/
  ```

- [ ] Verify your deal folder exists
  ```bash
  ls -la data/deals/YOUR_DEAL_ID/
  ```

## ✅ First Analysis

- [ ] Run analysis
  ```bash
  npm run analyze -- --deal-id YOUR_DEAL_ID
  ```

- [ ] Should see:
  - ✓ "Deal: [Name]"
  - ✓ "Calls: X"
  - ✓ "Transcripts: X"
  - ✓ "Analysis complete!"

- [ ] Check analysis files were created
  ```bash
  ls -la data/analysis/
  ```

- [ ] Should see 3 files:
  - `YOUR_DEAL_ID-deal-loss-prompt.md`
  - `YOUR_DEAL_ID-customer-sentiment-prompt.md`
  - `YOUR_DEAL_ID-summary.md`

## ✅ Review Analysis

- [ ] Open `data/analysis/YOUR_DEAL_ID-summary.md`

- [ ] Review deal overview and call activity

- [ ] Open `data/analysis/YOUR_DEAL_ID-deal-loss-prompt.md`

- [ ] Copy entire contents

- [ ] Paste into ChatGPT (GPT-4) or Claude (Opus/Sonnet)

- [ ] Review AI-generated insights

- [ ] Repeat for customer sentiment prompt

## ✅ Verify Everything Works

Run the status command:
```bash
npm run dev status
```

You should see:
- [ ] Last sync date/time
- [ ] Number of deals synced
- [ ] List of available deals
- [ ] Data directory paths

## 🎉 You're All Set!

If all checkboxes are checked, you're ready to analyze lost deals!

## 🚨 Troubleshooting

If something didn't work, check:

### Can't connect to Gong
- [ ] Credentials are correct in `.env`
- [ ] No extra spaces or quotes in `.env`
- [ ] You have Gong Administrator access
- [ ] Your internet connection is working

### No calls found for deal
- [ ] Deal ID is correct
- [ ] Deal exists in Gong
- [ ] Deal has associated calls
- [ ] Try a different deal ID

### No transcripts found
- [ ] Recording was enabled for those calls
- [ ] Transcripts are available in Gong
- [ ] Some calls may not have transcripts (this is OK)

### Permission errors
- [ ] Check file permissions on project directory
- [ ] Ensure you can write to the `data/` folder
- [ ] Try running with appropriate permissions

## 📚 Next Steps

Once setup is complete:

1. **Sync multiple deals**
   ```bash
   npm run sync -- --deal-id DEAL_ID_1
   npm run sync -- --deal-id DEAL_ID_2
   ```

2. **Analyze all deals at once**
   ```bash
   npm run analyze -- --all
   ```

3. **Look for patterns**
   - Compare insights across multiple deals
   - Identify common objections or red flags
   - Share learnings with sales team

4. **Read the documentation**
   - `README.md` - General overview
   - `QUICKSTART.md` - Quick start guide
   - `GONG_ACCESS_GUIDE.md` - Gong API details
   - `ARCHITECTURE.md` - Technical architecture

## 💡 Tips

- **Start Small**: Sync 1-2 deals first to get comfortable
- **Check Regularly**: Run sync weekly to keep data fresh
- **Share Insights**: Discuss findings with sales leadership
- **Iterate**: Adjust your sales process based on learnings

## 🤝 Getting Help

If you're stuck:
1. Check the troubleshooting section above
2. Review the documentation files
3. Check application logs for error details
4. Verify Gong API credentials and access

---

**Happy analyzing!** 🚀



