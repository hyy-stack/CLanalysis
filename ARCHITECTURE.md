# Architecture Overview

This document explains the technical architecture of the Anrok Closed/Lost Deal Analyzer.

## Design Principles

1. **Extensibility**: Easy to add new data sources beyond Gong
2. **Modularity**: Clear separation of concerns
3. **Type Safety**: Full TypeScript with strict mode
4. **Local-First**: All data stored locally for privacy and speed
5. **MVP-Focused**: Simple file-based approach, can evolve to database/API

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Interface                        │
│                 (Commander.js + TypeScript)                 │
└──────────────────┬──────────────────┬──────────────────────┘
                   │                  │
        ┌──────────▼────────┐  ┌─────▼──────────┐
        │  Sync Command     │  │ Analyze Command│
        └──────────┬────────┘  └─────┬──────────┘
                   │                  │
        ┌──────────▼────────┐  ┌─────▼──────────┐
        │  Data Sources     │  │ Analysis Engine│
        │  - Gong (MVP)     │  │ - Prompt Loader│
        │  - Future: SF, HS │  │ - LLM Client   │
        └──────────┬────────┘  └─────┬──────────┘
                   │                  │
                   ▼                  ▼
        ┌──────────────────────────────────────┐
        │       Local File Storage (JSON)      │
        │  - Deals, Calls, Transcripts         │
        │  - Analysis Prompts & Results        │
        └──────────────────────────────────────┘
```

## Directory Structure

```
anrok-closedlost-bot/
├── src/                           # Source code
│   ├── index.ts                   # CLI entry point (Commander.js)
│   │
│   ├── config/                    # Configuration management
│   │   └── config.ts              # Env vars, paths, validation (Zod)
│   │
│   ├── types/                     # TypeScript types
│   │   └── common.ts              # Shared types (Deal, Call, Transcript, etc.)
│   │
│   ├── datasources/               # Data source abstraction layer
│   │   ├── base.ts                # DataSource interface & base class
│   │   └── gong/                  # Gong implementation
│   │       ├── client.ts          # Gong API client (REST calls)
│   │       ├── datasource.ts      # DataSource implementation for Gong
│   │       └── types.ts           # Gong-specific types
│   │
│   ├── storage/                   # Local data persistence
│   │   ├── index.ts               # Storage interface & FileStorage
│   │   └── deals.ts               # DealRepository (high-level ops)
│   │
│   └── analysis/                  # Analysis engine
│       ├── engine.ts              # Main analysis orchestration
│       ├── prompt-loader.ts       # Load markdown prompt templates
│       └── llm-client.ts          # LLM interface (file-based for MVP)
│
├── prompts/                       # Analysis prompt templates
│   ├── deal-loss-analysis.md     # Comprehensive deal loss analysis
│   └── customer-sentiment.md     # Customer listening deep dive
│
├── data/                          # Local storage (gitignored)
│   ├── deals/                     # Deal data
│   │   └── {dealId}/
│   │       ├── deal.json          # Deal metadata
│   │       ├── calls/
│   │       │   └── {callId}.json  # Call metadata
│   │       └── transcripts/
│   │           └── {callId}.json  # Call transcript
│   ├── analysis/                  # Generated analysis prompts
│   │   ├── {dealId}-deal-loss-prompt.md
│   │   ├── {dealId}-customer-sentiment-prompt.md
│   │   └── {dealId}-summary.md
│   └── sync-metadata.json         # Last sync timestamp, counts
│
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript configuration
├── .gitignore                     # Ignore node_modules, data/, .env
├── .env                           # Environment variables (user creates)
│
└── Documentation
    ├── README.md                  # Main documentation
    ├── QUICKSTART.md              # Getting started guide
    ├── GONG_ACCESS_GUIDE.md       # Gong API access instructions
    └── ARCHITECTURE.md            # This file
```

## Core Components

### 1. CLI Interface (`src/index.ts`)

**Purpose**: Command-line interface for user interaction

**Commands**:
- `sync` - Fetch data from Gong
- `analyze` - Run analysis on synced data
- `status` - Show sync status and available deals

**Technology**: Commander.js

**Flow**:
```
User runs command → Parse args → Initialize components → Execute → Display results
```

### 2. Configuration (`src/config/config.ts`)

**Purpose**: Centralized configuration management

**Responsibilities**:
- Load environment variables from `.env`
- Validate configuration with Zod schema
- Provide typed configuration object
- Define storage paths

**Environment Variables**:
- `GONG_ACCESS_KEY` - Gong API username
- `GONG_ACCESS_KEY_SECRET` - Gong API password
- `DEAL_STAGES_TO_ANALYZE` - Filter criteria (optional)
- `DATA_DIR` - Local storage path (optional)

### 3. Data Source Abstraction (`src/datasources/`)

**Purpose**: Extensible plugin system for different data sources

**Interface** (`base.ts`):
```typescript
interface DataSource {
  name: string;
  syncDeals(filter: DealFilter): Promise<Deal[]>;
  syncCallsForDeal(dealId: string): Promise<Call[]>;
  getTranscript(callId: string): Promise<Transcript>;
  testConnection(): Promise<boolean>;
}
```

**Gong Implementation** (`gong/`):
- `client.ts` - Low-level HTTP calls to Gong API
- `datasource.ts` - Implements DataSource interface
- `types.ts` - Gong-specific response types

**Future Data Sources**:
- Salesforce (CRM data)
- HubSpot (CRM data)
- Email (Gmail, Outlook)
- Slack (conversations)

### 4. Storage Layer (`src/storage/`)

**Purpose**: Persist data locally as JSON files

**Components**:
- `FileStorage` - Low-level file operations
- `DealRepository` - High-level deal data management

**Storage Strategy**:
```
data/
└── deals/
    └── deal-123/
        ├── deal.json           # Deal metadata
        ├── calls/
        │   ├── call-1.json     # Chronologically sorted
        │   └── call-2.json
        └── transcripts/
            ├── call-1.json     # Matched to calls
            └── call-2.json
```

**Benefits**:
- Simple to inspect and debug
- No database setup required
- Easy to version control (if desired)
- Portable across systems

**Future Enhancement**: SQLite for querying, relationships

### 5. Analysis Engine (`src/analysis/`)

**Purpose**: Generate analysis prompts from deal data

**Components**:

**a) Prompt Loader** (`prompt-loader.ts`)
- Loads markdown prompt templates
- Replaces placeholders with actual data
- Supports custom prompts

**b) LLM Client** (`llm-client.ts`)
- **MVP**: Outputs prompts to files for manual LLM use
- **Future**: API integration (OpenAI, Anthropic, etc.)

**c) Analysis Engine** (`engine.ts`)
- Orchestrates the analysis process
- Formats deal data for prompts
- Generates comprehensive analysis files
- Creates summary reports

**Analysis Flow**:
```
Load Deal → Load Calls → Load Transcripts →
Format for Prompt → Fill Template → Save to File →
User copies to LLM → LLM analyzes → User reviews insights
```

## Data Flow

### Sync Process

```
1. User runs: npm run sync -- --deal-id 12345
2. CLI validates config & credentials
3. Initialize Gong data source
4. Test connection to Gong API
5. Fetch calls for deal (GET /v2/calls)
6. For each call:
   a. Fetch transcript (POST /v2/calls/transcript)
   b. Enrich with participant roles
   c. Save to local storage
7. Update sync metadata
8. Display summary
```

### Analysis Process

```
1. User runs: npm run analyze -- --deal-id 12345
2. Load deal data from local storage
3. Load all calls (sorted chronologically)
4. Load all transcripts
5. For each analysis type:
   a. Load prompt template (markdown)
   b. Format deal info
   c. Format call transcripts
   d. Fill template placeholders
   e. Save filled prompt to file
6. Generate summary report
7. Display file paths
```

## Type System

All data flows through strongly-typed interfaces:

### Core Types (`src/types/common.ts`)

```typescript
// Central data models
Deal            # Deal metadata & participants
Call            # Call metadata & participants  
Transcript      # Speaker turns with timestamps
TranscriptTurn  # Individual speaker statement

// Supporting types
Participant     # Person in deal/call
DealFilter      # Criteria for filtering deals
SyncMetadata    # Sync tracking
AnalysisResult  # Analysis output structure
```

### Type Flow

```
Gong API Response (GongCall) 
  → mapGongCallToCall() 
  → Call (common type)
  → Storage
  → Analysis Engine
  → Prompt Template
```

## Extensibility Points

### Adding a New Data Source

1. Create `src/datasources/{source}/` directory
2. Implement `DataSource` interface
3. Create client for API calls
4. Map source-specific types to common types
5. Register in CLI

Example: Salesforce
```typescript
export class SalesforceDataSource implements DataSource {
  async syncDeals(filter: DealFilter): Promise<Deal[]> {
    // SOQL query for Opportunities
    // Map to common Deal type
  }
  // ... implement other methods
}
```

### Adding a New Analysis Type

1. Create new prompt in `prompts/{analysis-type}.md`
2. Add method to `PromptLoader`
3. Add method to `AnalysisEngine`
4. Update CLI to expose new analysis

### Adding LLM API Integration

1. Implement `LLMClient` interface in `llm-client.ts`
2. Add API key to config
3. Create API-specific client (OpenAI, Anthropic, etc.)
4. Update `AnalysisEngine` to use API client
5. Store results directly instead of prompts

## Security Considerations

1. **API Credentials**: Stored in `.env`, never committed
2. **Data Privacy**: All data stored locally
3. **No External Transmission**: Data stays on your machine (MVP)
4. **Future**: Implement encryption for sensitive data

## Performance Considerations

1. **Rate Limiting**: Gong API has rate limits (handled in client)
2. **Pagination**: Large call lists paginated
3. **Incremental Sync**: Track last sync, only fetch new data
4. **Parallel Processing**: Could fetch transcripts in parallel (future)

## Error Handling

1. **Connection Errors**: Test connection before sync
2. **Missing Data**: Graceful degradation (no transcript = analysis still works)
3. **Validation**: Zod schemas validate config
4. **User-Friendly Messages**: Clear error messages with solutions

## Testing Strategy (Future)

1. **Unit Tests**: Individual functions
2. **Integration Tests**: API calls (mocked)
3. **E2E Tests**: Full sync & analyze flow
4. **Type Tests**: TypeScript strict mode

## Future Architecture Enhancements

### Short-term (Next 3-6 months)
- SQLite database for better querying
- LLM API integration (OpenAI/Anthropic)
- Salesforce/HubSpot data sources
- Web UI for viewing insights

### Long-term (6-12 months)
- Multi-tenant SaaS deployment
- Real-time webhooks
- Automated scheduled analysis
- Slack/email notifications
- Custom prompt builder UI
- Team collaboration features

## Development Workflow

```bash
# Development (with auto-reload)
npm run dev {command}

# Build for production
npm run build

# Run production build
npm start {command}
```

## Dependencies

### Production
- `commander` - CLI framework
- `dotenv` - Environment variable loading
- `zod` - Schema validation

### Development
- `typescript` - Type system & compiler
- `tsx` - TypeScript execution
- `@types/node` - Node.js type definitions

### Notable: No Gong SDK
We're using direct HTTP calls to Gong API for:
- Full control over requests
- Better error handling
- Easier to debug
- No third-party dependency issues

## Conclusion

This architecture provides a solid foundation for the MVP while maintaining extensibility for future enhancements. The modular design allows each component to be improved or replaced independently without affecting the rest of the system.



