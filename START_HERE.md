# 👋 Welcome to Anrok Closed/Lost Deal Analyzer!

## 🎯 What This Does

Analyzes lost sales deals by pulling data from Gong and generating AI-powered insights to help you understand:
- **When** the deal started going wrong
- **Why** the customer really walked away
- **What** red flags were missed
- **How** to prevent similar losses

## ⚡ Quick Start (5 Minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Get Gong API Credentials
- Log in to Gong as administrator
- Go to: **Admin center > Settings > Ecosystem > API**
- Click **Get API Key**
- Copy both the Access Key and Access Key Secret

### 3. Create `.env` File
```bash
cat > .env << 'EOF'
GONG_ACCESS_KEY=paste_your_access_key_here
GONG_ACCESS_KEY_SECRET=paste_your_secret_here
EOF
```

### 4. Find an Account ID or Deal ID

**Option A: Account ID (Recommended for most cases)**
- Open a customer account in Gong
- Get the ID from the URL: `https://app.gong.io/company/12345`
- The ID is: `12345`

**Option B: Deal ID (If you have a specific opportunity)**
- Open a deal in Gong
- Get the ID from the URL: `https://app.gong.io/deals/67890`
- The ID is: `67890`

📚 **Need help finding IDs?** See `FINDING_IDS_IN_GONG.md`

### 5. Sync Your First Account/Deal

**With Account ID** (gets all calls for that customer):
```bash
npm run sync -- --account-id 12345
```

**Or with Deal ID** (gets calls for specific opportunity):
```bash
npm run sync -- --deal-id 67890
```

Replace the numbers with your actual ID.

### 6. Generate Analysis
```bash
npm run analyze -- --deal-id 12345
```

### 7. Review Insights
- Open `data/analysis/{dealId}-deal-loss-prompt.md`
- Copy the entire content
- Paste into ChatGPT (GPT-4) or Claude
- Read the AI-generated insights!

## 📚 Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Detailed quick start guide
- **[SETUP_CHECKLIST.md](SETUP_CHECKLIST.md)** - Verify your setup
- **[GONG_ACCESS_GUIDE.md](GONG_ACCESS_GUIDE.md)** - Gong API details
- **[README.md](README.md)** - Complete documentation
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical details
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - What was built

## 🆘 Need Help?

1. **Can't connect to Gong?** → Check `GONG_ACCESS_GUIDE.md`
2. **Setup issues?** → Follow `SETUP_CHECKLIST.md`
3. **Want to understand the code?** → Read `ARCHITECTURE.md`

## 💻 Available Commands

```bash
# Check current status
npm run dev status

# Sync by account ID (recommended - gets all calls for a customer)
npm run sync -- --account-id YOUR_ACCOUNT_ID

# Sync by deal ID (specific opportunity)
npm run sync -- --deal-id YOUR_DEAL_ID

# Analyze (use the same ID you synced with)
npm run analyze -- --deal-id YOUR_ID

# Analyze all synced accounts/deals
npm run analyze -- --all
```

## ✨ What You'll Get

After analysis, you'll receive:
1. **Deal Loss Analysis** - Comprehensive breakdown of why the deal failed
2. **Customer Sentiment Analysis** - Deep dive into customer responses
3. **Summary Report** - Quick overview of the deal

All saved as markdown files in `data/analysis/`

## 🚀 Next Steps

1. ✅ Complete the quick start above
2. ✅ Analyze 2-3 lost deals
3. ✅ Look for patterns across deals
4. ✅ Share insights with your sales team
5. ✅ Improve your sales process!

---

**Ready? Start with the Quick Start above!** ⬆️

