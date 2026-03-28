import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { put } from '@vercel/blob';

// ─── Gong API helpers ─────────────────────────────────────────────────────────

function gongAuth() {
  const key    = process.env.GONG_ACCESS_KEY ?? '';
  const secret = process.env.GONG_ACCESS_KEY_SECRET ?? '';
  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
}

async function gongPost<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.gong.io${endpoint}`, {
    method: 'POST',
    headers: { Authorization: gongAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gong ${endpoint} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GongCallMeta {
  metaData: {
    id: string;
    title?: string;
    started?: string;
    scheduled?: string;
  };
  parties?: GongParty[];
  context?: GongContext[];
}

interface GongParty {
  speakerId?: string;
  name?: string;
  title?: string;
  emailAddress?: string;
  affiliation?: string;
}

interface GongContext {
  objects?: GongContextObject[];
}

interface GongContextObject {
  objectType?: string;
  objectId?: string;
  fields?: { name: string; value: string }[];
}

interface GongTranscriptSentence {
  start?: number;
  end?: number;
  text?: string;
}

interface GongTranscriptSegment {
  speakerId?: string;
  sentences?: GongTranscriptSentence[];
}

interface GongCallTranscript {
  callId: string;
  transcript?: GongTranscriptSegment[];
}

// ─── Fetch calls from Gong since a given timestamp ───────────────────────────

async function fetchRecentCalls(fromDateTime: string): Promise<GongCallMeta[]> {
  const calls: GongCallMeta[] = [];
  let cursor: string | undefined;

  // Page through all results
  do {
    const body: any = {
      filter: { fromDateTime },
      contentSelector: {
        exposedFields: { parties: true, content: { structure: true } },
      },
    };
    if (cursor) body.cursor = cursor;

    const data = await gongPost<any>('/v2/calls', body);
    calls.push(...(data.calls ?? []));
    cursor = data.records?.cursor;
  } while (cursor);

  return calls;
}

// ─── Fetch transcripts for a batch of call IDs ───────────────────────────────

async function fetchTranscripts(
  callIds: string[],
  fromDateTime: string,
  toDateTime: string,
): Promise<Map<string, GongCallTranscript>> {
  const map = new Map<string, GongCallTranscript>();
  if (callIds.length === 0) return map;

  // Gong transcript API accepts up to 50 IDs per request
  const BATCH = 50;
  for (let i = 0; i < callIds.length; i += BATCH) {
    const batch = callIds.slice(i, i + BATCH);
    const data = await gongPost<{ callTranscripts?: GongCallTranscript[] }>(
      '/v2/calls/transcript',
      { filter: { callIds: batch, fromDateTime, toDateTime } },
    );
    for (const t of data.callTranscripts ?? []) {
      map.set(t.callId, t);
    }
  }
  return map;
}

// ─── Extract CRM context from a call ─────────────────────────────────────────

function extractContext(call: GongCallMeta) {
  let crmId: string | undefined;
  let dealName: string | undefined;
  let accountName: string | undefined;
  let stage: string | undefined;

  for (const ctx of call.context ?? []) {
    for (const obj of ctx.objects ?? []) {
      if (obj.objectType === 'Opportunity') {
        crmId    ??= obj.objectId;
        dealName  ??= obj.fields?.find(f => f.name === 'Name')?.value;
        stage     ??= obj.fields?.find(f => f.name === 'StageName')?.value;
      }
      if (obj.objectType === 'Account') {
        accountName ??= obj.fields?.find(f => f.name === 'Name')?.value;
      }
    }
  }

  return { crmId, dealName, accountName, stage };
}

// ─── DB upserts (same pattern as import/transcripts route) ───────────────────

async function upsertDeal(opts: {
  crmId?: string;
  dealName?: string;
  accountName?: string;
  stage?: string;
}): Promise<string> {
  const res = await sql.query(
    `INSERT INTO deals (id, crm_id, name, account_name, stage, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
     ON CONFLICT (crm_id) DO UPDATE SET
       name         = COALESCE(EXCLUDED.name, deals.name),
       account_name = COALESCE(EXCLUDED.account_name, deals.account_name),
       stage        = COALESCE(EXCLUDED.stage, deals.stage),
       updated_at   = NOW()
     RETURNING id`,
    [opts.crmId ?? null, opts.dealName ?? null, opts.accountName ?? null, opts.stage ?? null],
  );
  return res.rows[0].id as string;
}

async function upsertInteraction(opts: {
  dealId: string;
  callId: string;
  title: string;
  timestamp: string;
  participants: object[];
  blobUrl: string;
  turnCount: number;
}) {
  await sql.query(
    `INSERT INTO interactions
       (id, deal_id, external_id, type, title, timestamp, participants, blob_url, source, metadata, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'call', $3, $4, $5, $6, 'gong_sync', $7, NOW())
     ON CONFLICT (external_id) DO UPDATE SET
       deal_id      = EXCLUDED.deal_id,
       title        = COALESCE(EXCLUDED.title, interactions.title),
       timestamp    = COALESCE(EXCLUDED.timestamp, interactions.timestamp),
       participants = EXCLUDED.participants,
       blob_url     = EXCLUDED.blob_url,
       metadata     = EXCLUDED.metadata`,
    [
      opts.dealId,
      opts.callId,
      opts.title,
      opts.timestamp,
      JSON.stringify(opts.participants),
      opts.blobUrl,
      JSON.stringify({ turnCount: opts.turnCount, syncedAt: new Date().toISOString() }),
    ],
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Verify this is called by Vercel Cron (or an authorized manual trigger)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now      = new Date();
  const fromDate = new Date(now);
  fromDate.setHours(fromDate.getHours() - 25); // 25h window to cover cron drift

  const fromDateTime = fromDate.toISOString();
  const toDateTime   = now.toISOString();

  console.log(`[gong-sync] Fetching calls from ${fromDateTime}`);

  let imported = 0;
  let skipped  = 0;
  const errors: string[] = [];

  try {
    // 1. Get all calls from the last 25 hours
    const calls = await fetchRecentCalls(fromDateTime);
    console.log(`[gong-sync] Found ${calls.length} calls`);

    if (calls.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, message: 'No new calls' });
    }

    // 2. Fetch transcripts in batches
    const callIds = calls.map(c => c.metaData.id);
    const transcripts = await fetchTranscripts(callIds, fromDateTime, toDateTime);

    // 3. Process each call
    for (const call of calls) {
      const callId    = call.metaData.id;
      const timestamp = call.metaData.started ?? call.metaData.scheduled ?? now.toISOString();
      const title     = call.metaData.title ?? 'Untitled Call';
      const parties   = call.parties ?? [];

      try {
        // Build speaker ID → name map
        const speakerMap = new Map(parties.map(p => [p.speakerId, p.name ?? 'Unknown']));

        // Flatten transcript into turns
        const rawTranscript = transcripts.get(callId);
        const turns = (rawTranscript?.transcript ?? []).flatMap(seg =>
          (seg.sentences ?? []).map(s => ({
            speakerName: speakerMap.get(seg.speakerId ?? '') ?? seg.speakerId ?? 'Unknown',
            text: s.text ?? '',
          }))
        );

        // Upload to Vercel Blob
        const { url: blobUrl } = await put(
          `transcripts/${callId}.json`,
          JSON.stringify({ callId, turns }),
          { access: 'public', contentType: 'application/json', addRandomSuffix: false },
        );

        // Extract CRM context
        const { crmId, dealName, accountName, stage } = extractContext(call);

        // Upsert deal + interaction
        const dealId = await upsertDeal({ crmId, dealName, accountName, stage });

        const participants = parties.map(p => ({
          name:        p.name        ?? '',
          title:       p.title       ?? '',
          affiliation: p.affiliation ?? '',
          email:       p.emailAddress ?? '',
        }));

        await upsertInteraction({
          dealId,
          callId,
          title,
          timestamp,
          participants,
          blobUrl,
          turnCount: turns.length,
        });

        imported++;
        console.log(`[gong-sync] ✓ ${callId} — ${title} (${turns.length} turns)`);
      } catch (err) {
        errors.push(`${callId}: ${err instanceof Error ? err.message : String(err)}`);
        skipped++;
      }
    }
  } catch (err) {
    console.error('[gong-sync] Fatal error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 },
    );
  }

  console.log(`[gong-sync] Done — ${imported} imported, ${skipped} skipped`);
  return NextResponse.json({ imported, skipped, errors: errors.slice(0, 10) });
}
