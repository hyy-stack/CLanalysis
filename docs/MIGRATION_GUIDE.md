# Migration Guide from Local MVP to Production

This guide helps you transition from the local CLI tool to the production Vercel app.

## Overview

**Local MVP** (what you've been using):
- Manual sync via CLI commands
- Stores data in local JSON files
- Manual copy/paste to LLM
- Great for testing and understanding

**Production App** (new):
- Automatic via Gong webhooks
- Stores in Vercel Postgres + Blob
- Automatic Claude API analysis
- Automatic Slack posting

## What You've Already Done

✅ Analyzed several deals locally:
- Lovable (3 calls, 1,119 turns)
- Office Practicum (3 calls, 985 turns)
- HighRadius (2 calls, 1,051 turns)

✅ Refined the prompts:
- Active deal health analysis
- Closed-lost analysis
- Customer sentiment analysis

✅ Identified what works

## What Changes

| Aspect | Local MVP | Production |
|--------|-----------|------------|
| Data input | Manual CLI sync | Automatic webhooks + manual email import |
| Storage | JSON files | Postgres + Blob |
| Analysis | Manual LLM paste | Automatic Claude API |
| Output | Local markdown | Slack threads |
| Deployment | Local only | Cloud (Vercel) |

## Migration Steps

### 1. Keep Both Systems (Recommended)

**Don't delete the local MVP!** It's still useful for:
- Ad-hoc analysis of specific calls
- Testing new prompts
- Exploring deals before committing to production

**Use production for**:
- Ongoing monitoring
- Automatic analysis
- Team sharing via Slack

### 2. Copy Working Prompts

The prompts are already copied to the Vercel app in `vercel-app/prompts/`:
- ✅ `active-deal-analysis.md`
- ✅ `deal-loss-analysis.md`
- ✅ `customer-sentiment.md`

These are the same prompts you've been testing locally.

### 3. Don't Migrate Historical Data (Yet)

For MVP, start fresh:
- Let Gong webhooks populate new deals
- Manually import critical historical emails if needed
- Past analyses in local files remain available

**Future**: Build import script to migrate local JSON → Postgres

### 4. Transition Workflow

**Week 1**: Run both systems in parallel
- Local CLI: Continue analyzing existing deals
- Production: Start receiving new webhooks
- Compare outputs

**Week 2+**: Primarily use production
- New calls automatic
- Use local CLI only for specific deep dives

## Using Both Systems Together

### Local MVP - When to Use

```bash
# Quick ad-hoc analysis
cd /path/to/anrok-closedlost-bot
npm run sync -- --company-name "NewCo"
npm run analyze -- --deal-id newco

# Testing prompt changes
# Edit prompts/active-deal-analysis.md
npm run analyze -- --deal-id test-deal

# Exploring calls by date range
npm run sync -- --company-name "Acme" --from-date "2025-01-01"
```

### Production - Automatic Flow

```
1. Sales rep has call → Gong records
2. Gong processes → Webhook sent
3. System ingests → Stores in DB
4. (Manual) Trigger analysis → Posts to Slack
5. Team reviews in Slack thread
```

### Production - Manual Operations

```bash
# Import emails
curl -X POST https://your-app.vercel.app/api/import-emails \
  -d @emails.json

# Trigger analysis for specific deal
curl -X POST https://your-app.vercel.app/api/analyze-deal \
  -d '{"crmId": "006PP..."}'
```

## Data Access

### Local Data

```bash
# Your local analyses are in:
ls data/analysis/

# lovable-deal-loss-prompt.md
# office-practicum-active-deal-health-prompt.md
# etc.
```

### Production Data

**Database** (via Vercel dashboard or SQL client):
```sql
SELECT * FROM deals;
SELECT * FROM interactions WHERE deal_id = 'uuid';
SELECT * FROM analyses ORDER BY created_at DESC;
```

**Blob Storage** (via Vercel CLI):
```bash
vercel blob ls
vercel blob get transcripts/6226038272614881523.json
```

**Slack** (in your configured channel):
- All analyses posted as threads
- Searchable in Slack
- Permanent record

## Prompt Iteration Workflow

### Test Locally First

1. Edit prompt in local MVP: `prompts/active-deal-analysis.md`
2. Test with existing data: `npm run analyze -- --deal-id lovable`
3. Review output
4. Iterate

### Deploy to Production

1. Copy refined prompt to: `vercel-app/prompts/active-deal-analysis.md`
2. Commit and push (or `vercel deploy`)
3. New analyses will use updated prompt

## Best Practices

### For Active Deals

**Production**: Analyze after each new call
```bash
curl -X POST .../api/analyze-deal -d '{"crmId": "006..."}'
```

**Review**: Check Slack for warnings/next steps

### For Lost Deals

**Local**: Deep dive analysis
```bash
npm run sync -- --company-name "LostCo"
npm run analyze -- --deal-id lostco
# Paste into Claude for deep conversation
```

**Production**: Historical record
- Email import for context
- Analysis for team learning

### For Deal Resets

Like the Lovable example:
- Use local MVP with `--call-ids` for isolated analysis
- Compare with production's full history view

## FAQ

**Q: Should I delete the local MVP?**
A: No! Keep it for ad-hoc analysis and testing.

**Q: Can I analyze old deals in production?**
A: Yes, import emails and trigger analysis manually.

**Q: Do I need to manually trigger analysis?**
A: For MVP, yes. Future: auto-trigger after each call.

**Q: Can I change prompts without redeploying?**
A: Currently no. Future: store prompts in database.

**Q: What happens if Claude API is down?**
A: Analysis fails gracefully, can retry manually later.

## Transition Timeline

**Day 1**: Deploy and configure
**Days 2-7**: Test with new calls, run parallel with local
**Week 2**: Primary production use
**Month 1**: Fully automated, local only for deep dives

## Support

**Issues with production app**:
- Check Vercel logs
- Review [DEPLOYMENT.md](DEPLOYMENT.md)
- Review [TESTING.md](TESTING.md)

**Issues with local MVP**:
- The local MVP has been removed - all functionality is now in the production app

## Summary

You now have:
- ✅ **Local CLI** - For exploration and testing
- ✅ **Production API** - For automation and team sharing

Use both as needed! The local tool is perfect for deep dives, while production handles the day-to-day automated flow.

