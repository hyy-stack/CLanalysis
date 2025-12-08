# Testing Guide

How to test the Deal Analyzer app locally and in production.

## Local Testing

### 1. Set Up Local Environment

```bash
cd vercel-app
npm install

# Create .env.local with all required variables
cp .env.example .env.local
# Edit .env.local with your actual keys
```

### 2. Run Development Server

```bash
npm run dev
```

App runs at `http://localhost:3000`

### 3. Test Database Connection

Create a test script:

```javascript
// test-db.js
const { sql } = require('@vercel/postgres');

async function test() {
  const result = await sql`SELECT NOW()`;
  console.log('Database time:', result.rows[0].now);
}

test();
```

Run: `node test-db.js`

### 4. Test Blob Storage

```javascript
// test-blob.js
const { put, list } = require('@vercel/blob');

async function test() {
  const blob = await put('test.txt', 'Hello World', { access: 'public' });
  console.log('Blob URL:', blob.url);
}

test();
```

## API Endpoint Testing

### Test Gong Webhook (Mock)

```bash
curl -X POST http://localhost:3000/api/gong-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "call.processed",
    "callId": "1234567890",
    "timestamp": "2025-12-01T10:00:00Z",
    "crmOpportunityIds": ["006PP00000OjGVqYAN"]
  }'
```

**Expected**: Should fetch call from Gong, store in DB

### Test Email Import

```bash
curl -X POST http://localhost:3000/api/import-emails \
  -H "Content-Type: application/json" \
  -d '{
    "emails": [
      {
        "crmId": "006PP00000OjGVqYAN",
        "subject": "Re: Pricing question",
        "from": "customer@lovable.com",
        "to": "sales@anrok.com",
        "timestamp": "2025-11-20T14:30:00Z",
        "body": "Thanks for the proposal. We have some questions about the pricing structure..."
      }
    ],
    "triggerAnalysis": false
  }'
```

**Expected**: Email stored in Blob, record in DB

### Test Analysis

```bash
curl -X POST http://localhost:3000/api/analyze-deal \
  -H "Content-Type: application/json" \
  -d '{
    "crmId": "006PP00000OjGVqYAN"
  }'
```

**Expected**: 
- Fetches all interactions
- Calls Claude API
- Posts to Slack
- Returns analysis

## Integration Testing

### End-to-End Flow

1. **Import a call** (simulate webhook):
   - POST to `/api/gong-webhook` with test call ID
   - Verify call stored in database
   - Check Blob storage has transcript

2. **Import an email**:
   - POST to `/api/import-emails`
   - Verify email stored
   - Check association with deal

3. **Trigger analysis**:
   - POST to `/api/analyze-deal`
   - Verify Claude called
   - Check Slack channel for post
   - Verify analysis stored in DB

4. **Verify Slack thread**:
   - Check main message posted
   - Check thread has details
   - Verify file attachment

## Production Testing

### After Deployment

1. **Test webhook endpoint**:
```bash
curl https://your-app.vercel.app/api/gong-webhook
```

2. **Check database**:
```sql
SELECT * FROM deals ORDER BY created_at DESC LIMIT 5;
SELECT * FROM interactions ORDER BY created_at DESC LIMIT 5;
SELECT * FROM analyses ORDER BY created_at DESC LIMIT 5;
```

3. **Monitor Vercel logs**:
- Go to Vercel dashboard → Functions
- Watch for webhook calls
- Check for errors

### Test Real Gong Webhook

Gong admin panel has a "Test Webhook" button:
1. Go to Webhook configuration
2. Click "Test"
3. Select a recent call
4. Send test webhook
5. Verify received in Vercel logs

## Common Test Scenarios

### Scenario 1: New Call Webhook

**Given**: Gong processes a new call
**When**: Webhook sent to `/api/gong-webhook`
**Then**: 
- Call transcript stored in Blob
- Deal created/updated in Postgres
- Interaction record created
- Returns 200 OK

### Scenario 2: Duplicate Webhook

**Given**: Same call webhook sent twice
**When**: Second webhook received
**Then**:
- Detects duplicate (idempotency check)
- Returns "already_processed"
- No duplicate records created

### Scenario 3: Call Without CRM ID

**Given**: Call not associated with CRM opportunity
**When**: Webhook received
**Then**:
- Call stored with null deal_id
- Can be manually associated later
- No error thrown

### Scenario 4: Complete Analysis Flow

**Given**: Deal has 3 calls and 2 emails
**When**: Analysis triggered
**Then**:
- All 5 interactions retrieved in chronological order
- Claude analyzes full context
- Structured results saved
- Slack thread created with summary

### Scenario 5: Active vs. Lost Deal

**Given**: Two deals with different stages
**When**: Both analyzed
**Then**:
- Active deal gets "health analysis" prompt
- Lost deal gets "loss analysis" prompt
- Different Slack formatting
- Different insights focus

## Error Testing

### Test Missing Environment Variables

```bash
# Remove one env var temporarily
unset ANTHROPIC_API_KEY
npm run dev
# Try analysis - should fail gracefully
```

### Test Invalid CRM ID

```bash
curl -X POST http://localhost:3000/api/analyze-deal \
  -d '{"crmId": "INVALID"}'
```

**Expected**: 404 with clear error message

### Test Malformed Email Import

```bash
curl -X POST http://localhost:3000/api/import-emails \
  -d '{
    "emails": [{"crmId": "test"}]
  }'
```

**Expected**: 400 with validation errors

## Performance Testing

### Large Transcript

Test with a call that has 500+ turns (long conversation):
- Should handle gracefully
- Blob storage should work
- Claude should process (within token limits)

### Multiple Emails

Import 50 emails at once:
- Should batch process
- Should return success/failure counts
- Should complete within timeout limits

## Monitoring Checklist

After deployment, verify:

- [x] Webhook endpoint responding
- [x] Database tables created
- [x] Blob storage working
- [x] Claude API calls succeeding
- [x] Slack posts appearing
- [x] Error handling working
- [x] Idempotency working
- [x] Logs are readable

## Debug Tools

### View Database Contents

```bash
vercel postgres -- "SELECT COUNT(*) FROM deals;"
vercel postgres -- "SELECT * FROM interactions ORDER BY created_at DESC LIMIT 5;"
```

### View Blob Contents

```bash
# List all blobs
vercel blob ls

# Show blob content
vercel blob get transcripts/6226038272614881523.json
```

### Check Logs

```bash
# Tail logs in real-time
vercel logs --follow

# Filter by function
vercel logs api/gong-webhook
```

## Success Criteria

✅ Gong webhook successfully receives and processes calls
✅ Transcripts stored in Blob, metadata in Postgres
✅ Analysis runs automatically or on-demand
✅ Claude provides structured insights
✅ Slack channel receives formatted analyses
✅ No duplicate processing
✅ Error handling graceful
✅ Performance acceptable (< 60s total)

## Next Steps After Testing

1. Monitor for 24-48 hours
2. Review first few analyses
3. Refine prompts if needed
4. Adjust Slack formatting
5. Set up error alerts
6. Document any edge cases found

