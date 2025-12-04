# Anrok Closed/Lost Deal Analyzer

A TypeScript application that analyzes lost sales deals by pulling data from Gong and providing insights into customer conversations.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Gong API credentials:
   - Create a `.env` file in the project root
   - Get your Gong API credentials from: Admin center > Settings > Ecosystem > API
   - Add the following to your `.env` file:

```bash
# Gong API Credentials
GONG_ACCESS_KEY=your_access_key_here
GONG_ACCESS_KEY_SECRET=your_access_key_secret_here

# Optional: Configure deal stages to filter
DEAL_STAGES_TO_ANALYZE=closed_lost,stalled,no_decision

# Data storage path (relative to project root)
DATA_DIR=./data
```

3. Build the project (optional - you can use `tsx` to run directly):
```bash
npm run build
```

## Usage

### Check current status
```bash
npm run dev status
```

### Sync data from Gong

You can sync using either an **Account ID** (company) or **Deal ID** (specific opportunity).

**By Account ID** (recommended - gets all calls with a customer):
```bash
npm run sync -- --account-id <your-account-id>
```

**By Deal ID** (specific opportunity):
```bash
npm run sync -- --deal-id <your-deal-id>
```

Example:
```bash
npm run sync -- --account-id 1234567890
```

**Need help finding IDs?** See `FINDING_IDS_IN_GONG.md` for a detailed guide.

### Analyze synced deals

Analyze a specific deal:
```bash
npm run analyze -- --deal-id <your-deal-id>
```

Analyze all synced deals:
```bash
npm run analyze -- --all
```

### What happens during analysis?

The analysis engine will:
1. Load your deal data and call transcripts
2. Generate comprehensive analysis prompts based on the templates
3. Save the prompts as markdown files in `data/analysis/`
4. Create a summary report

You then:
1. Open the generated prompt files in your IDE
2. Copy and paste them into your preferred LLM (GPT-4, Claude, etc.)
3. Review the AI-generated insights to understand why deals were lost

## Architecture

- **Data Sources**: Extensible plugin system (currently supports Gong)
- **Storage**: Local JSON files in `data/` directory
- **Analysis**: Markdown-based prompts for flexible analysis
- **CLI**: Simple command-line interface for sync and analysis

## Project Structure

```
├── src/
│   ├── index.ts              # CLI entry point
│   ├── config/               # Configuration management
│   ├── datasources/          # Data source plugins
│   ├── storage/              # Local storage operations
│   ├── analysis/             # Analysis engine
│   └── types/                # TypeScript types
├── prompts/                  # Analysis prompt templates
├── data/                     # Local data storage (gitignored)
└── package.json
```

## Requirements

- Node.js 18+
- Gong Administrator access for API credentials
- Gong permissions: Read calls, Read deals/opportunities

