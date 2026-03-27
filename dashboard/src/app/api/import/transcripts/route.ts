import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { sql } from '@vercel/postgres';

interface TranscriptMetadata {
  title?: string;
  timestamp?: string;
  dealName?: string;
  accountName?: string;
  crmId?: string;
  stage?: string;
}

interface Participant {
  name?: string;
  title?: string;
  affiliation?: string;
  emailAddress?: string;
}

interface Transcript {
  callId?: string;
  turns?: unknown[];
  _metadata?: TranscriptMetadata;
  _participants?: Participant[];
}

async function upsertDeal(meta: TranscriptMetadata): Promise<string> {
  const result = await sql.query(
    `INSERT INTO deals (id, crm_id, name, account_name, stage, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
     ON CONFLICT (crm_id) DO UPDATE SET
       name         = COALESCE(EXCLUDED.name, deals.name),
       account_name = COALESCE(EXCLUDED.account_name, deals.account_name),
       stage        = COALESCE(EXCLUDED.stage, deals.stage),
       updated_at   = NOW()
     RETURNING id`,
    [meta.crmId ?? null, meta.dealName ?? null, meta.accountName ?? null, meta.stage ?? null]
  );
  return result.rows[0].id as string;
}

async function upsertInteraction(
  dealId: string,
  callId: string,
  meta: TranscriptMetadata,
  participants: Participant[],
  turnCount: number
) {
  const participantJson = participants.map(p => ({
    name: p.name ?? '',
    title: p.title ?? '',
    affiliation: p.affiliation ?? '',
    email: p.emailAddress ?? '',
  }));

  await sql.query(
    `INSERT INTO interactions
       (id, deal_id, external_id, type, title, timestamp, participants, blob_url, source, metadata, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'call', $3, $4, $5, $6, 'manual_import', $7, NOW())
     ON CONFLICT (external_id) DO UPDATE SET
       deal_id      = EXCLUDED.deal_id,
       title        = COALESCE(EXCLUDED.title, interactions.title),
       timestamp    = COALESCE(EXCLUDED.timestamp, interactions.timestamp),
       participants = EXCLUDED.participants,
       metadata     = EXCLUDED.metadata`,
    [
      dealId,
      callId,
      meta.title ?? meta.dealName ?? 'Call',
      meta.timestamp ? new Date(meta.timestamp).toISOString() : new Date().toISOString(),
      JSON.stringify(participantJson),
      `imported://transcripts/${callId}.json`,
      JSON.stringify({ turnCount, importedAt: new Date().toISOString() }),
    ]
  );
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    return NextResponse.json({ error: 'Invalid ZIP file' }, { status: 400 });
  }

  const entries = zip.getEntries().filter(e => e.entryName.endsWith('.json') && !e.isDirectory);

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No JSON files found in ZIP' }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    const filename = entry.entryName;
    try {
      const raw = entry.getData().toString('utf-8');
      const transcript: Transcript = JSON.parse(raw);

      const meta = transcript._metadata ?? {};
      const participants = transcript._participants ?? [];
      const callId = transcript.callId;

      if (!callId) {
        skipped++;
        continue;
      }

      if (!meta.crmId) {
        skipped++;
        continue;
      }

      const dealId = await upsertDeal(meta);
      const turnCount = Array.isArray(transcript.turns) ? transcript.turns.length : 0;
      await upsertInteraction(dealId, callId, meta, participants, turnCount);
      imported++;
    } catch (err) {
      errors.push(`${filename}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    total: entries.length,
    imported,
    skipped,
    errors: errors.slice(0, 10), // cap error list
  });
}
