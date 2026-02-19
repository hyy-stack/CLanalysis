# Plan: CoM Coaching Tool — deal-analyzer Extension

## Context

Steve has developed and validated a stage-aware CoM sales coaching pipeline in this workbench (prompts, reference docs, Python tools). The goal is to productionize it as an extension of the existing Anrok deal-analyzer app on Vercel. The coaching tool will:
- Trigger when a Gong call is processed
- Enrich with Salesforce CoM + MEDDPICC fields
- Assemble stage-aware context (field gaps vs. stage expectations)
- Run a two-stage coaching pipeline via Claude
- Post a rep-facing digest to a private Slack channel
- Store coaching outputs in Vercel Postgres for manager visibility and history

Only `com-discovery-coaching.md` and `com-rep-digest.md` are in scope (per the brief). Other prompts are ready when needed.

---

## Architecture Fit

The deal-analyzer already has:
- Gong webhook → transcript ingestion → Blob storage
- Salesforce client (OAuth 2.0, fetches role_segment, ARR, owner)
- Claude client (`lib/claude/client.ts`)
- `analyses` table with `analysis_type` enum
- Slack posting with channel routing
- API key auth middleware

The coaching feature extends each of these without restructuring them.

---

## Implementation Steps

### Step 1: Set Up Private Slack Channel ✅ Done
- Channel: `#coaching-analysis` (ID: `C0AFLMFUWNT`)
- Add `SLACK_COACHING_CHANNEL_ID=C0AFLMFUWNT` to Vercel environment variables

### Step 2: DB Migration
**New file:** `vercel-app/scripts/009_coaching_analyses.sql`

Add two new `analysis_type` values to the `analyses` table:
- `coaching_stage1` — Full coaching output (for manager visibility)
- `coaching_digest` — Slack-ready rep digest (< 300 words)

No new tables needed. Store `stage_context` (field gaps, stage expectations) in the existing `structured_data` JSONB column.

### Step 3: Extend Salesforce Client
**Modify:** `vercel-app/lib/salesforce/client.ts`

Add a new function `getCoMFields(opportunityId)` that fetches:

**CoM custom fields:**
- `Pain__c` → identified_pain
- `Value_Drivers__c` → value_drivers
- `Desired_Future_State_After_PBOs__c` → desired_future_state
- `Measure_Results_Metrics__c` → metrics
- `Decision_Criteria__c` → decision_criteria
- `Differentiators__c` → differentiators
- `Mantra__c` → mantra

**MEDDPICC fields** (fetch whatever is stored in SF — confirm field API names with Gabe or discover via describe)

Keep existing `getOpportunityFields()` function unchanged.

### Step 4: Port Prompts
**New files in** `vercel-app/prompts/`:
- `com-discovery-coaching.md` — Stage 1: full coaching output
- `com-rep-digest.md` — Stage 2: Slack digest + bot feedback

Adaptation from local workbench:
- Strip YAML frontmatter (deal-analyzer prompts don't use it)
- Convert `{{variable}}` placeholders to match the new coaching pipeline's variable names: `{{TRANSCRIPT}}`, `{{DEAL_INFO}}`, `{{STAGE_CONTEXT}}`, `{{REP_NAME}}`, `{{COACHING_OUTPUT}}`
- Embed the CoM reference content directly in the system prompt (the reference files from `reference/com-framework-overview.md`, `com-vocabulary.md`, `com-differentiators.md` get baked in)

### Step 5: Stage Framework
**New file:** `vercel-app/lib/coaching/stage-framework.ts`

Encodes the stage-progression framework from `build-coaching-tool.md`:
- `STAGE_EXPECTATIONS` — constant mapping Qualify/Discover/Scope/Validate to expected CoM and MEDDPICC field states
- `getStageExpectations(stage)` — returns expectations for a given deal stage
- `detectFieldGaps(salesforceFields, stage)` — compares populated fields against expectations, returns array of gap objects: `{ field, expectedState, actualValue, severity }`
- `assessMantraQuality(mantraValue, stage)` — evaluates mantra against stage bar (Emerging/Strong/Executive-Resonant)
- `formatStageContext(stage, gaps, mantraAssessment)` — produces markdown block injected into the coaching prompt

Maps Salesforce `StageName` values to the four coaching stages (Qualify/Discover/Scope/Validate).

### Step 6: Coaching Pipeline
**New file:** `vercel-app/lib/coaching/pipeline.ts`

Two functions:

`runStage1(transcript, dealInfo, stageContext, repName)`:
- Loads `prompts/com-discovery-coaching.md`
- Fills variables
- Calls existing `lib/claude/client.ts`
- Returns raw coaching output (markdown)

`runStage2(transcript, stage1Output, repName)`:
- Loads `prompts/com-rep-digest.md`
- Fills variables (includes `{{COACHING_OUTPUT}}` = Stage 1 result)
- Calls Claude
- Parses response into two parts: Slack digest (Part 1) and bot feedback (Part 2)
- Returns `{ slackDigest, botFeedback }`

Helper: `fillCoachingPrompt(template, vars)` — simple string replacement for the 5 coaching variables.

### Step 7: Slack Coaching Post
**Modify:** `vercel-app/lib/slack/client.ts`

New function `postCoachingDigest(deal, interaction, digest, channelId)`:
- Posts to `SLACK_COACHING_CHANNEL_ID` (not the existing deal analysis channels)
- Main message: deal name, rep name, call date, call title
- Thread: the Slack digest from Stage 2 (pre-formatted markdown, under 300 words)
- No buttons needed initially (per Gabe: "start with posting to a private channel")

### Step 8: New API Endpoint
**New file:** `vercel-app/app/api/coach-deal/route.ts`

`POST /api/coach-deal`

Request body: `{ crmId: string }` or `{ dealId: string }`

Pipeline:
1. Auth check via `requireApiKey()`
2. Fetch deal from DB
3. Fetch latest interaction (the most recent call) from DB
4. Fetch transcript from Blob
5. Call `getCoMFields()` from extended Salesforce client
6. Determine deal stage (from `deal.stage`)
7. Call `detectFieldGaps()` + `formatStageContext()`
8. Run Stage 1 coaching (`runStage1()`)
9. Store Stage 1 result in `analyses` table with `analysis_type = 'coaching_stage1'`
10. Run Stage 2 digest (`runStage2()`)
11. Store Stage 2 result in `analyses` table with `analysis_type = 'coaching_digest'`
12. Post Slack digest to coaching channel
13. Return `{ stage1Id, stage2Id, slackTs }`

### Step 9: Webhook Auto-Trigger (Default behavior)
**Modify:** `vercel-app/app/api/gong-webhook/route.ts`

The coaching pipeline runs automatically on every eligible Gong call — same as the existing deal analysis. After the existing `analyze-deal` call fires, the webhook handler also calls the coaching pipeline directly (not via HTTP — import and call the coaching function in-process to avoid latency and auth overhead).

**Trigger conditions (same exclusions as existing analysis):**
- Deal is active (not post-sales, not onboarding-only)
- Call has a CRM opportunity linked
- Deal stage maps to Qualify, Discover, Scope, or Validate

**What runs automatically:**
1. Stage 1 coaching (`runStage1`) — generates full coaching output, stored in `analyses` table
2. Stage 2 digest (`runStage2`) — generates Slack-ready digest, stored in `analyses` table
3. `postCoachingDigest()` — posts digest to the private coaching Slack channel

**Manual endpoint preserved:** `POST /api/coach-deal` still works for re-running coaching on a specific deal (testing, re-analysis after SF fields are updated, etc.). It accepts `crmId` or `dealId` and runs the same pipeline on demand.

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
| CREATE | `vercel-app/scripts/009_coaching_analyses.sql` |
| CREATE | `vercel-app/lib/coaching/stage-framework.ts` |
| CREATE | `vercel-app/lib/coaching/pipeline.ts` |
| CREATE | `vercel-app/app/api/coach-deal/route.ts` |
| CREATE | `vercel-app/prompts/com-discovery-coaching.md` |
| CREATE | `vercel-app/prompts/com-rep-digest.md` |
| MODIFY | `vercel-app/lib/salesforce/client.ts` (add `getCoMFields()`) |
| MODIFY | `vercel-app/lib/slack/client.ts` (add `postCoachingDigest()`) |
| MODIFY | `vercel-app/app/api/gong-webhook/route.ts` (add auto coaching trigger) |

---

## Open Questions (resolve before implementation)

1. **Salesforce MEDDPICC field names** — The CoM custom fields are known (`Pain__c`, `Mantra__c`, etc.). The MEDDPICC fields need API names confirmed. Options: ask Gabe, run a `describe()` call against the SF org, or skip MEDDPICC for v1 and add in a follow-up once names are confirmed. Recommended: skip for v1 — CoM fields alone are sufficient to generate strong coaching.

2. **Stage scope** — Coach all active stages (Qualify → Validate), or start narrower (e.g., Qualify + Discover only)? Current plan defaults to all four active stages using the same exclusion logic as the existing webhook.

---

## Verification

1. Run `npm run db:migrate` — confirms migration applies cleanly
2. `POST /api/coach-deal` with a known `crmId` that has a Gong transcript → should see Stage 1 + Stage 2 stored in `analyses` table and a Slack message in the private channel
3. Check `analyses` table: two rows with `analysis_type = 'coaching_stage1'` and `analysis_type = 'coaching_digest'`
4. Verify `structured_data` column contains stage context (field gaps)
5. Verify Slack digest is under 300 words and correctly formatted
