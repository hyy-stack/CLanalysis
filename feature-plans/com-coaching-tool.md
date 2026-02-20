# Plan: CoM Coaching Tool — deal-analyzer Extension

## Context

Steve has developed and validated a stage-aware CoM sales coaching pipeline in this workbench (prompts, reference docs, Python tools). The goal is to productionize it as an extension of the existing Anrok deal-analyzer app on Vercel. The coaching tool will:
- Trigger automatically when a Gong call is processed (and support manual re-runs via API)
- Enrich with Salesforce CoM fields
- Assemble stage-aware context (field gaps vs. stage expectations)
- Run a two-stage coaching pipeline via Claude
- Post a rep-facing digest to a private Slack channel
- Store coaching outputs in Vercel Postgres for history

**Manager visibility read path is explicitly out of scope for v1.** Coaching outputs are stored and retrievable via DB query. A read endpoint or UI surface is deferred to a follow-up.

Only `com-discovery-coaching.md` and `com-rep-digest.md` are in scope (per the brief). Other prompts are ready when needed.

---

## Architecture Fit

The deal-analyzer already has:
- Gong webhook → transcript ingestion → Blob storage
- Salesforce client (OAuth 2.0, fetches role_segment, ARR, owner)
- Claude client (`lib/claude/client.ts`)
- `analyses` table with `analysis_type` stored as `VARCHAR(50)` with a `CHECK` constraint
- Slack posting with channel routing
- API key auth middleware

The coaching feature extends each of these without restructuring them.

---

## Implementation Steps

### Step 1: Set Up Private Slack Channel ✅ Done
- Channel: `#coaching-analysis` (ID: `C0AFLMFUWNT`)
- Add `SLACK_COACHING_CHANNEL_ID=C0AFLMFUWNT` to Vercel environment variables

### Step 2: DB Migration
**New file:** `vercel-app/lib/db/migrations/009_coaching_analyses.sql`

`analysis_type` is a `VARCHAR(50)` column with a `CHECK` constraint (not a Postgres ENUM). The migration drops and re-adds the `CHECK` constraint to include two new values:
- `coaching_stage1` — Full coaching output (stored for history and future manager visibility)
- `coaching_digest` — Slack-ready rep digest (< 300 words)

Also update the TypeScript union type for `analysisType` in `lib/db/client.ts` (`createAnalysis()` function, line ~370) to include `'coaching_stage1' | 'coaching_digest'`.

No new tables needed. Both new `structured_data` JSONB columns will store:
- `coaching_stage1` row: `{ interaction_id, stage, stageContext, fieldGaps, mantraAssessment }`
- `coaching_digest` row: `{ interaction_id, slackDigest, botFeedback }`

Storing `interaction_id` in `structured_data` on both rows allows coaching outputs to be traced back to the specific call that triggered them (important when multiple calls exist for the same deal).

### Step 3: TypeScript Types
**Modify:** `vercel-app/types/database.ts`

Add formal types for coaching structured data:

```typescript
interface CoachingStage1Data {
  interaction_id: string
  stage: string                    // Salesforce StageName
  stageContext: string             // formatted markdown block
  fieldGaps: FieldGap[]
  mantraAssessment: MantraAssessment
}

interface FieldGap {
  field: string
  expectedState: string
  actualValue: string | null
  severity: 'critical' | 'moderate' | 'low'
}

interface MantraAssessment {
  value: string | null
  qualityForStage: 'not_yet' | 'emerging' | 'strong' | 'executive_resonant'
  isGap: boolean
}

interface CoachingDigestData {
  interaction_id: string
  slackDigest: string              // Part 1 — rep-facing, < 300 words
  botFeedback: string              // Part 2 — system-facing prompt improvement notes
}
```

**Modify:** `vercel-app/lib/salesforce/client.ts`

Extend the `SalesforceOpportunity` interface to include CoM custom fields (`Pain__c`, `Mantra__c`, etc.) so TypeScript doesn't reject them when `getCoMFields()` reads the response.

### Step 4: Extend Salesforce Client
**Modify:** `vercel-app/lib/salesforce/client.ts`

Add a new function `getCoMFields(opportunityId)` that fetches:

**CoM custom fields (API names confirmed):**
- `Pain__c` → identified_pain
- `Value_Drivers__c` → value_drivers
- `Desired_Future_State_After_PBOs__c` → desired_future_state
- `Measure_Results_Metrics__c` → metrics
- `Decision_Criteria__c` → decision_criteria
- `Differentiators__c` → differentiators
- `Mantra__c` → mantra

**Standard field also fetched:** `StageName` — the Salesforce opportunity stage name (Qualify, Discover, Scope, Validate). This is the authoritative stage source for the coaching framework, not the normalized `deal.stage` stored in the DB.

**MEDDPICC fields: skipped for v1.** CoM fields are sufficient for strong coaching. MEDDPICC field API names need to be confirmed with Gabe before adding.

Keep existing `getOpportunityFields()` function unchanged.

### Step 5: Port Prompts
**New files in** `vercel-app/prompts/`:
- `com-discovery-coaching.md` — Stage 1: full coaching output
- `com-rep-digest.md` — Stage 2: Slack digest + bot feedback

Adaptation from local workbench:
- Strip YAML frontmatter (deal-analyzer prompts don't use it)
- Convert `{{variable}}` placeholders to: `{{TRANSCRIPT}}`, `{{DEAL_INFO}}`, `{{STAGE_CONTEXT}}`, `{{REP_NAME}}`, `{{COACHING_OUTPUT}}`
- Embed CoM reference content directly in system prompt (baked in from `reference/com-framework-overview.md`, `com-vocabulary.md`, `com-differentiators.md`)

### Step 6: Stage Framework
**New file:** `vercel-app/lib/coaching/stage-framework.ts`

Encodes the stage-progression framework:
- `STAGE_EXPECTATIONS` — constant mapping Qualify/Discover/Scope/Validate to expected CoM field states
- `getStageExpectations(sfStageName)` — maps Salesforce `StageName` to coaching stage, returns expectations
- `detectFieldGaps(comFields, sfStageName)` — compares populated fields against expectations, returns `FieldGap[]`
- `assessMantraQuality(mantraValue, sfStageName)` — returns `MantraAssessment`
- `formatStageContext(sfStageName, gaps, mantraAssessment)` — produces markdown block injected into the prompt

Input is always the raw Salesforce `StageName` (from `getCoMFields()` response), not `deal.stage`.

### Step 7: Coaching Pipeline
**New file:** `vercel-app/lib/coaching/pipeline.ts`

The existing `ClaudeClient.analyze()` method parses responses for specific markdown headers (`execSummary`, `nextSteps`, `details`) and will mangle coaching output. Coaching needs raw Claude output.

Add a new method `analyzeRaw(systemPrompt, userPrompt): Promise<string>` to `lib/claude/client.ts` that calls the Anthropic SDK directly and returns the raw text response without any section parsing. The coaching pipeline uses this method.

`runStage1(transcript, dealInfo, stageContext, repName)`:
- Loads `prompts/com-discovery-coaching.md`
- Fills variables via `fillCoachingPrompt()`
- Calls `ClaudeClient.analyzeRaw()`
- Returns raw markdown string

`runStage2(transcript, stage1Output, repName)`:
- Loads `prompts/com-rep-digest.md`
- Fills variables (includes `{{COACHING_OUTPUT}}` = Stage 1 result)
- Calls `ClaudeClient.analyzeRaw()`
- Parses response into two parts by splitting on a known delimiter (the prompt instructs Claude to separate Part 1 and Part 2 with `---BOT-FEEDBACK---`)
- Returns `{ slackDigest: string, botFeedback: string }`

`botFeedback` is stored in the `coaching_digest` row's `structured_data.botFeedback` field. It is not posted to Slack.

Helper: `fillCoachingPrompt(template, vars)` — simple string replacement for coaching variables.

### Step 8: Slack Coaching Post
**Modify:** `vercel-app/lib/slack/client.ts`

New function `postCoachingDigest(deal, interaction, slackDigest, channelId)`:
- Posts to `SLACK_COACHING_CHANNEL_ID` (not the existing deal analysis channels)
- Main message: deal name, rep name, call date, call title
- Thread: the Slack digest from Stage 2 (pre-formatted markdown, under 300 words)
- No buttons needed initially

### Step 9: New API Endpoint
**New file:** `vercel-app/app/api/coach-deal/route.ts`

`POST /api/coach-deal`

Request body: `{ crmId: string }` or `{ dealId: string }`

Pipeline:
1. Auth check via `requireApiKey()`
2. Fetch deal from DB
3. Fetch latest interaction (most recent call) from DB — store `interaction.id` for tracking
4. Fetch transcript from Blob
5. Call `getCoMFields()` — returns CoM fields **and `StageName`** from Salesforce
6. Determine coaching stage from `StageName` (Salesforce response, not `deal.stage`)
7. Call `detectFieldGaps()` + `assessMantraQuality()` + `formatStageContext()`
8. Run Stage 1 coaching (`runStage1()`)
9. Store Stage 1 result: `analyses` row with `analysis_type = 'coaching_stage1'`, `structured_data = { interaction_id, stage, stageContext, fieldGaps, mantraAssessment }`
10. Run Stage 2 digest (`runStage2()`)
11. **If Stage 2 fails:** log error, return partial success `{ stage1Id, error: 'stage2_failed' }` — Stage 1 row is kept (not rolled back). No Slack post. Manual re-run via `/api/coach-deal` will retry the full pipeline.
12. Store Stage 2 result: `analyses` row with `analysis_type = 'coaching_digest'`, `structured_data = { interaction_id, slackDigest, botFeedback }`
13. Post `slackDigest` to `#coaching-analysis`
14. Return `{ stage1Id, stage2Id, slackTs }`

### Step 10: Webhook Auto-Trigger
**Modify:** `vercel-app/app/api/gong-webhook/route.ts`

Coaching fires automatically for every eligible Gong call using the same **fire-and-forget `fetch()`** pattern as the existing deal analysis trigger. The webhook does not call the coaching pipeline in-process — two sequential Claude API calls + Salesforce + Slack would exceed Vercel function timeout limits.

After the existing `analyze-deal` fire-and-forget fires, add:

```typescript
// Trigger coaching asynchronously - fire and forget
fetch(`${PRODUCTION_URL}/api/coach-deal`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  },
  body: JSON.stringify({ dealId: deal.id }),
})
```

**Trigger conditions (same exclusions as existing analysis):**
- Deal is active (not post-sales, not onboarding-only)
- Call has a CRM opportunity linked
- Deal stage maps to Qualify, Discover, Scope, or Validate

**Manual endpoint preserved:** `POST /api/coach-deal` works for re-runs (testing, re-analysis after SF field updates). Uses the same pipeline.

---

## Environment Variables to Add

| Variable | Description |
|----------|-------------|
| `SLACK_COACHING_CHANNEL_ID` | `C0AFLMFUWNT` (`#coaching-analysis`) |

Salesforce OAuth vars already exist. No new SF credentials needed.

---

## Files Modified / Created

| Action | File |
|--------|------|
| CREATE | `vercel-app/lib/db/migrations/009_coaching_analyses.sql` |
| CREATE | `vercel-app/lib/coaching/stage-framework.ts` |
| CREATE | `vercel-app/lib/coaching/pipeline.ts` |
| CREATE | `vercel-app/app/api/coach-deal/route.ts` |
| CREATE | `vercel-app/prompts/com-discovery-coaching.md` |
| CREATE | `vercel-app/prompts/com-rep-digest.md` |
| MODIFY | `vercel-app/lib/db/client.ts` (extend `analysisType` union type) |
| MODIFY | `vercel-app/lib/claude/client.ts` (add `analyzeRaw()` method) |
| MODIFY | `vercel-app/lib/salesforce/client.ts` (add `getCoMFields()`, extend `SalesforceOpportunity` interface) |
| MODIFY | `vercel-app/lib/slack/client.ts` (add `postCoachingDigest()`) |
| MODIFY | `vercel-app/types/database.ts` (add `CoachingStage1Data`, `CoachingDigestData`, `FieldGap`, `MantraAssessment`) |
| MODIFY | `vercel-app/app/api/gong-webhook/route.ts` (add fire-and-forget coaching trigger) |

---

## Open Questions (resolve before implementation)

1. **Salesforce MEDDPICC field names** — Skipped for v1. CoM fields are sufficient. Add in a follow-up once API names are confirmed with Gabe.

2. **Stage scope** — Plan defaults to all four active stages (Qualify → Validate) using the same webhook exclusion logic as existing analysis. Narrow if preferred.

---

## Verification

1. Run `npm run db:migrate` — confirms CHECK constraint migration applies cleanly
2. `POST /api/coach-deal` with a known `crmId` → Stage 1 + Stage 2 rows in `analyses`, Slack message in `#coaching-analysis`
3. Check `analyses` table: both rows have `interaction_id` in `structured_data`
4. Trigger a test Gong webhook → confirm coaching fires automatically via fire-and-forget
5. Simulate Stage 2 failure → confirm Stage 1 row persists, no Slack post, endpoint returns `{ stage1Id, error: 'stage2_failed' }`
6. Verify Slack digest is under 300 words and correctly formatted
