import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db-client';
import { put } from '@vercel/blob';
import jwt from 'jsonwebtoken';

// ─── Gong API helpers ────────────────────────────────────────────────────────

function gongAuthHeader() {
  const key    = process.env.GONG_ACCESS_KEY ?? '';
  const secret = process.env.GONG_ACCESS_KEY_SECRET ?? '';
  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
}

async function gongFetch<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.gong.io${endpoint}`, {
    method: 'POST',
    headers: { Authorization: gongAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gong ${endpoint} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// Fetch call metadata (title, parties) ─────────────────────────────────────

interface GongParty {
  speakerId?: string;
  name?: string;
  title?: string;
  emailAddress?: string;
  affiliation?: string;
}

async function fetchCallMeta(callId: string): Promise<{ title?: string; started?: string; parties: GongParty[] }> {
  try {
    const data = await gongFetch<any>('/v2/calls', {
      filter: { callIds: [callId] },
      contentSelector: { exposedFields: { parties: true } },
    });
    const call = data?.calls?.[0] ?? {};
    return {
      title:   call.metaData?.title   ?? call.title,
      started: call.metaData?.started ?? call.started,
      parties: call.parties ?? [],
    };
  } catch (err) {
    console.error('[gong-webhook] fetchCallMeta failed:', err);
    return { parties: [] };
  }
}

// Fetch transcript turns ────────────────────────────────────────────────────

interface Turn { speakerName: string; text: string }

async function fetchTranscript(callId: string, timestamp: string): Promise<Turn[]> {
  const date    = new Date(timestamp);
  const dayBefore = new Date(date); dayBefore.setDate(date.getDate() - 1);
  const dayAfter  = new Date(date); dayAfter.setDate(date.getDate() + 1);

  try {
    const data = await gongFetch<any>('/v2/calls/transcript', {
      filter: {
        callIds: [callId],
        fromDateTime: dayBefore.toISOString(),
        toDateTime:   dayAfter.toISOString(),
      },
    });

    const raw: any[] = data?.callTranscripts?.[0]?.transcript ?? [];

    // Build speakerId → name map using the parties (fetched separately and injected below)
    // Flatten sentences into one turn per speaker+sentence
    return raw.flatMap((seg: any) => {
      const name = seg.speakerName ?? seg.speakerId ?? 'Unknown';
      return (seg.sentences ?? []).map((s: any) => ({ speakerName: name, text: s.text ?? '' }));
    });
  } catch (err) {
    console.error('[gong-webhook] fetchTranscript failed:', err);
    return [];
  }
}

// ─── Payload parsing ─────────────────────────────────────────────────────────

interface ParsedPayload {
  callId: string;
  timestamp: string;
  title?: string;
  crmId?: string;
  dealName?: string;
  accountName?: string;
  stage?: string;
  parties: GongParty[];
}

function parsePayload(body: any): ParsedPayload | null {
  const callData = body.callData ?? body;
  const meta     = callData.metaData ?? callData;

  const callId = meta.id ?? body.callId;
  if (!callId) return null;

  const timestamp = meta.started ?? meta.scheduled ?? new Date().toISOString();

  // Extract CRM opportunity data from context
  let crmId: string | undefined;
  let dealName: string | undefined;
  let accountName: string | undefined;
  let stage: string | undefined;

  const contexts: any[] = Array.isArray(callData.context) ? callData.context : [];
  for (const ctx of contexts) {
    for (const obj of (ctx.objects ?? [])) {
      if (obj.objectType === 'Opportunity') {
        crmId    ??= obj.objectId;
        const fields: any[] = obj.fields ?? [];
        dealName  ??= fields.find(f => f.name === 'Name')?.value;
        stage     ??= fields.find(f => f.name === 'StageName')?.value;
      }
      if (obj.objectType === 'Account') {
        const fields: any[] = obj.fields ?? [];
        accountName ??= fields.find(f => f.name === 'Name')?.value;
      }
    }
  }

  const parties: GongParty[] = Array.isArray(callData.parties) ? callData.parties : [];

  return { callId, timestamp, title: meta.title, crmId, dealName, accountName, stage, parties };
}

// ─── DB upserts ──────────────────────────────────────────────────────────────

async function upsertDeal(p: ParsedPayload): Promise<string> {
  const res = await sql.query(
    `INSERT INTO deals (id, crm_id, name, account_name, stage, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
     ON CONFLICT (crm_id) DO UPDATE SET
       name         = COALESCE(EXCLUDED.name, deals.name),
       account_name = COALESCE(EXCLUDED.account_name, deals.account_name),
       stage        = COALESCE(EXCLUDED.stage, deals.stage),
       updated_at   = NOW()
     RETURNING id`,
    [p.crmId ?? null, p.dealName ?? null, p.accountName ?? null, p.stage ?? null],
  );
  return res.rows[0].id as string;
}

async function upsertInteraction(
  dealId: string,
  p: ParsedPayload,
  blobUrl: string,
  turnCount: number,
) {
  const participants = p.parties.map(party => ({
    name:        party.name        ?? '',
    title:       party.title       ?? '',
    affiliation: party.affiliation ?? '',
    email:       party.emailAddress ?? '',
  }));

  await sql.query(
    `INSERT INTO interactions
       (id, deal_id, external_id, type, title, timestamp, participants, blob_url, source, metadata, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'call', $3, $4, $5, $6, 'gong_webhook', $7, NOW())
     ON CONFLICT (external_id) DO UPDATE SET
       deal_id      = EXCLUDED.deal_id,
       title        = COALESCE(EXCLUDED.title, interactions.title),
       timestamp    = COALESCE(EXCLUDED.timestamp, interactions.timestamp),
       participants = EXCLUDED.participants,
       blob_url     = EXCLUDED.blob_url,
       metadata     = EXCLUDED.metadata`,
    [
      dealId,
      p.callId,
      p.title ?? p.dealName ?? 'Call',
      new Date(p.timestamp).toISOString(),
      JSON.stringify(participants),
      blobUrl,
      JSON.stringify({ turnCount, source: 'gong_webhook', receivedAt: new Date().toISOString() }),
    ],
  );
}

// ─── JWT verification ────────────────────────────────────────────────────────

function verifyJWT(authHeader: string | null): boolean {
  const publicKey = process.env.GONG_WEBHOOK_PUBLIC_KEY;
  if (!publicKey || !authHeader) return false;

  try {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    let key = publicKey.trim();
    if (!key.includes('-----BEGIN')) {
      key = `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
    }
    jwt.verify(token, key, { algorithms: ['RS256'] });
    return true;
  } catch {
    return false;
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Always return 200 immediately — Gong retries on anything else
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ received: true }); }

  // Verify JWT signature
  if (!verifyJWT(req.headers.get('authorization'))) {
    console.warn('[gong-webhook] JWT verification failed — ignoring');
    return NextResponse.json({ received: true }); // still 200 to prevent flood of retries
  }

  const parsed = parsePayload(body);
  if (!parsed) {
    console.warn('[gong-webhook] Could not parse callId from payload');
    return NextResponse.json({ received: true });
  }

  const { callId, timestamp } = parsed;
  console.log(`[gong-webhook] Processing call ${callId}`);

  try {
    // Fetch full call metadata and transcript from Gong in parallel
    const [callMeta, turns] = await Promise.all([
      fetchCallMeta(callId),
      fetchTranscript(callId, timestamp),
    ]);

    // Merge party names from call metadata into the parsed parties
    // (webhook payload parties may lack speakerName; API parties have full info)
    if (callMeta.parties.length > 0) {
      parsed.parties = callMeta.parties;
    }
    parsed.title    ??= callMeta.title;
    parsed.timestamp  = callMeta.started ?? timestamp;

    // Enrich transcript turns with speaker names from party list
    const speakerMap = new Map(callMeta.parties.map(p => [p.speakerId, p.name ?? 'Unknown']));
    const enrichedTurns = turns.map(t => ({
      ...t,
      speakerName: speakerMap.get(t.speakerName) ?? t.speakerName,
    }));

    // Upload transcript JSON to Vercel Blob
    const blobContent = JSON.stringify({ callId, turns: enrichedTurns });
    const { url: blobUrl } = await put(
      `transcripts/${callId}.json`,
      blobContent,
      { access: 'public', contentType: 'application/json' },
    );

    // Upsert deal (may not have crmId — store as unlinked)
    const dealId = await upsertDeal(parsed);
    await upsertInteraction(dealId, parsed, blobUrl, enrichedTurns.length);

    console.log(`[gong-webhook] Stored call ${callId} → deal ${dealId} (${enrichedTurns.length} turns)`);
  } catch (err) {
    // Log but still return 200 — we don't want Gong to keep retrying
    console.error('[gong-webhook] Processing error:', err);
  }

  return NextResponse.json({ received: true });
}
