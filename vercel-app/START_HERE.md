# 🚀 Anrok Deal Analyzer - Production App

## What This Is

A production-ready Vercel application that automatically:
1. ✅ Receives Gong call webhooks
2. ✅ Stores transcripts in Vercel Blob
3. ✅ Analyzes deals with Claude AI
4. ✅ Posts insights to Slack threads
5. ✅ Accepts manual email imports

## Quick Deploy (30 Minutes)

See **[QUICKSTART.md](QUICKSTART.md)** for step-by-step deployment guide.

### tl;dr

```bash
cd vercel-app
npm install
vercel deploy
# Set up Postgres + Blob in Vercel dashboard
# Add environment variables
# Configure Gong webhook
# Set up Slack bot
```

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

## API Endpoints

| Endpoint | Purpose | Trigger |
|----------|---------|---------|
| `/api/gong-webhook` | Receive call webhooks | Automatic (Gong) |
| `/api/import-emails` | Import emails | Manual (API call) |
| `/api/analyze-deal` | Run analysis | Manual or auto |
| `/api/post-to-slack` | Post to Slack | Called by analyze |

## File Structure

```
vercel-app/
├── app/api/          # API route handlers
├── lib/              # Core business logic
│   ├── db/           # Postgres operations
│   ├── blob/         # Blob storage
│   ├── claude/       # AI integration
│   ├── slack/        # Slack posting
│   ├── gong/         # Gong API + webhooks
│   └── analysis/     # Context building
├── prompts/          # Analysis prompts (from MVP)
├── types/            # TypeScript types
└── scripts/          # Database migration
```

## Documentation

📖 **[QUICKSTART.md](QUICKSTART.md)** - 30-minute deployment guide
📖 **[README.md](README.md)** - Complete documentation
📖 **[DEPLOYMENT.md](DEPLOYMENT.md)** - Detailed deployment steps
📖 **[TESTING.md](TESTING.md)** - How to test everything
📖 **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical deep dive
📖 **[MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)** - Transition from local MVP

## What's Different from Local MVP

| Feature | Local MVP | Production |
|---------|-----------|------------|
| **Trigger** | Manual CLI commands | Automatic webhooks |
| **Storage** | JSON files | Postgres + Blob |
| **Analysis** | Copy/paste to LLM | Claude API |
| **Sharing** | Export files | Slack threads |
| **Scale** | One-off | Continuous monitoring |

## Reused from MVP

✅ All 3 analysis prompts (tested and refined)
✅ Gong API client logic
✅ Transcript parsing
✅ Type definitions

## New in Production

➕ Gong webhook handler
➕ Vercel Postgres database
➕ Vercel Blob storage
➕ Claude API integration
➕ Slack thread posting
➕ Email import API

## Next Steps

1. **Deploy**: Follow [QUICKSTART.md](QUICKSTART.md)
2. **Configure**: Set up Gong webhook, Slack bot
3. **Test**: Import an email, trigger analysis
4. **Monitor**: Watch for first webhook
5. **Review**: Check Slack for insights

## Current State

✅ **Fully implemented** - All code complete
✅ **Ready to deploy** - Just needs Vercel + config
✅ **Tested design** - Based on working MVP
✅ **Production-ready** - Error handling, logging, security

## Support

- **Deployment issues**: See DEPLOYMENT.md
- **Testing help**: See TESTING.md
- **Architecture questions**: See ARCHITECTURE.md
- **Migration help**: See MIGRATION_GUIDE.md

---

**Ready to deploy?** Start with [QUICKSTART.md](QUICKSTART.md)! 🎯

