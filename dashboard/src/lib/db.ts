import { sql } from '@/lib/db-client';
import type {
  Deal,
  DealDetail,
  DealFilters,
  DealsResponse,
  StatsResponse,
  FilterOptions,
  CsvRow,
  TranscriptRow,
  DealQueryFilters,
  DealQueryRow,
} from './types';
import { stageIndex } from './stages';

export async function getDeals(filters: DealFilters = {}): Promise<DealsResponse> {
  const {
    stage,
    team,
    owner_email,
    contact_email,
    search,
    page = 1,
    pageSize = 25,
  } = filters;

  const offset = (page - 1) * pageSize;

  // Build dynamic WHERE conditions
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (stage) {
    conditions.push(`d.stage = $${idx++}`);
    params.push(stage);
  }
  if (team) {
    conditions.push(`d.team = $${idx++}`);
    params.push(team);
  }
  if (owner_email) {
    conditions.push(`d.owner_email ILIKE $${idx++}`);
    params.push(`%${owner_email}%`);
  }
  if (search) {
    conditions.push(`(d.name ILIKE $${idx} OR d.account_name ILIKE $${idx} OR d.crm_id ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (contact_email) {
    conditions.push(`(
      EXISTS (
        SELECT 1 FROM interactions i
        WHERE i.deal_id = d.id
        AND i.participants::text ILIKE $${idx}
      )
      OR EXISTS (
        SELECT 1 FROM manual_emails me
        WHERE me.deal_id = d.id
        AND (me.from_email ILIKE $${idx} OR me.to_email ILIKE $${idx})
      )
    )`);
    params.push(`%${contact_email}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*) FROM deals d ${where}`;
  const dataQuery = `
    SELECT
      d.*,
      COUNT(DISTINCT i.id) FILTER (WHERE i.type = 'call') AS call_count,
      COUNT(DISTINCT i.id) FILTER (WHERE i.type = 'email') + COUNT(DISTINCT me.id) AS email_count,
      GREATEST(MAX(i.timestamp), MAX(me.timestamp)) AS last_activity_at,
      EXISTS (SELECT 1 FROM analyses a WHERE a.deal_id = d.id) AS has_analysis,
      (SELECT a2.analysis_type FROM analyses a2 WHERE a2.deal_id = d.id ORDER BY a2.created_at DESC LIMIT 1) AS latest_analysis_type
    FROM deals d
    LEFT JOIN interactions i ON i.deal_id = d.id
    LEFT JOIN manual_emails me ON me.deal_id = d.id
    ${where}
    GROUP BY d.id
    ORDER BY GREATEST(MAX(i.timestamp), MAX(me.timestamp), d.updated_at) DESC NULLS LAST
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  const [countResult, dataResult] = await Promise.all([
    sql.query(countQuery, params),
    sql.query(dataQuery, [...params, pageSize, offset]),
  ]);

  return {
    deals: dataResult.rows as Deal[],
    total: parseInt(countResult.rows[0].count, 10),
    page,
    pageSize,
  };
}

export async function getDealById(id: string): Promise<DealDetail | null> {
  const dealResult = await sql.query(
    `SELECT * FROM deals WHERE id = $1 OR crm_id = $1 LIMIT 1`,
    [id]
  );

  if (dealResult.rows.length === 0) return null;
  const deal = dealResult.rows[0] as Deal;

  const [interactionsResult, emailsResult, analysesResult] = await Promise.all([
    sql.query(
      `SELECT id, deal_id, external_id, type, title, timestamp, duration, participants, source, metadata, created_at
       FROM interactions WHERE deal_id = $1 ORDER BY timestamp DESC`,
      [deal.id]
    ),
    sql.query(
      `SELECT id, deal_id, subject, from_email, to_email, timestamp, import_batch_id, metadata, created_at
       FROM manual_emails WHERE deal_id = $1 ORDER BY timestamp DESC`,
      [deal.id]
    ),
    sql.query(
      `SELECT * FROM analyses WHERE deal_id = $1 ORDER BY created_at DESC`,
      [deal.id]
    ),
  ]);

  return {
    ...deal,
    interactions: interactionsResult.rows,
    manual_emails: emailsResult.rows,
    latest_analysis: analysesResult.rows[0] ?? null,
    all_analyses: analysesResult.rows,
  };
}

export async function getStats(): Promise<StatsResponse> {
  const [totals, byStage, recentActivity] = await Promise.all([
    sql.query(`
      SELECT
        COUNT(DISTINCT d.id) AS total_deals,
        COUNT(DISTINCT a.deal_id) AS analyzed_deals
      FROM deals d
      LEFT JOIN analyses a ON a.deal_id = d.id
    `),
    sql.query(`
      SELECT COALESCE(stage, 'Unknown') AS stage, COUNT(*) AS count
      FROM deals
      GROUP BY stage
      ORDER BY count DESC
    `),
    sql.query(`
      SELECT deal_id, deal_name, account_name, stage, activity_type, activity_at
      FROM (
        SELECT d.id AS deal_id, d.name AS deal_name, d.account_name, d.stage,
               'call' AS activity_type, i.timestamp AS activity_at
        FROM interactions i JOIN deals d ON d.id = i.deal_id
        UNION ALL
        SELECT d.id, d.name, d.account_name, d.stage,
               'email' AS activity_type, me.timestamp AS activity_at
        FROM manual_emails me JOIN deals d ON d.id = me.deal_id
        UNION ALL
        SELECT d.id, d.name, d.account_name, d.stage,
               'analysis' AS activity_type, a.created_at AS activity_at
        FROM analyses a JOIN deals d ON d.id = a.deal_id
      ) activity
      ORDER BY activity_at DESC
      LIMIT 10
    `),
  ]);

  const total = parseInt(totals.rows[0].total_deals, 10);
  const analyzed = parseInt(totals.rows[0].analyzed_deals, 10);

  return {
    total_deals: total,
    analyzed_deals: analyzed,
    unanalyzed_deals: total - analyzed,
    deals_by_stage: byStage.rows.map(r => ({ stage: r.stage, count: parseInt(r.count, 10) })),
    recent_activity: recentActivity.rows,
  };
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const [stages, teams, owners, dealNames] = await Promise.all([
    sql.query(`SELECT DISTINCT stage FROM deals WHERE stage IS NOT NULL ORDER BY stage`),
    sql.query(`SELECT DISTINCT team FROM deals WHERE team IS NOT NULL ORDER BY team`),
    sql.query(`
      SELECT DISTINCT owner_name, owner_email
      FROM deals
      WHERE owner_name IS NOT NULL OR owner_email IS NOT NULL
      ORDER BY owner_name
    `),
    sql.query(`SELECT DISTINCT name FROM deals WHERE name IS NOT NULL ORDER BY name`),
  ]);

  return {
    stages: stages.rows.map(r => r.stage),
    teams: teams.rows.map(r => r.team),
    owners: owners.rows.map(r => ({ name: r.owner_name ?? '', email: r.owner_email ?? '' })),
    dealNames: dealNames.rows.map(r => r.name as string),
  };
}

export async function getTranscriptsByDeal(dealName: string): Promise<TranscriptRow[]> {
  const result = await sql.query(
    `SELECT
       i.id, i.external_id, i.title, i.timestamp, i.duration, i.participants,
       d.id AS deal_id, d.name AS deal_name, d.stage, d.crm_id,
       a.id AS analysis_id, a.analysis_type, a.exec_summary, a.next_steps,
       a.details, a.slack_thread_ts, a.slack_channel, a.created_at AS analysis_at
     FROM interactions i
     JOIN deals d ON d.id = i.deal_id
     LEFT JOIN LATERAL (
       SELECT id, analysis_type, exec_summary, next_steps, details, slack_thread_ts, slack_channel, created_at
       FROM analyses
       WHERE deal_id = d.id
       ORDER BY created_at DESC
       LIMIT 1
     ) a ON true
     WHERE i.type = 'call'
       AND d.name ILIKE $1`,
    [`%${dealName}%`]
  );

  const rows = result.rows as TranscriptRow[];

  // Sort: stage ascending (canonical order), then timestamp descending
  rows.sort((a, b) => {
    const stageDiff = stageIndex(a.stage) - stageIndex(b.stage);
    if (stageDiff !== 0) return stageDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return rows;
}

export async function importDealMetadata(rows: CsvRow[]): Promise<{ updated: number; created: number }> {
  let updated = 0;
  let created = 0;

  for (const row of rows) {
    if (!row.crm_id) continue;

    const result = await sql.query(
      `INSERT INTO deals (id, crm_id, name, account_name, stage, team, owner_name, owner_email, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (crm_id) DO UPDATE SET
         name        = COALESCE(EXCLUDED.name, deals.name),
         account_name = COALESCE(EXCLUDED.account_name, deals.account_name),
         stage       = COALESCE(EXCLUDED.stage, deals.stage),
         team        = COALESCE(EXCLUDED.team, deals.team),
         owner_name  = COALESCE(EXCLUDED.owner_name, deals.owner_name),
         owner_email = COALESCE(EXCLUDED.owner_email, deals.owner_email),
         updated_at  = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        row.crm_id,
        row.deal_name ?? null,
        row.company_name ?? null,
        row.deal_stage ?? null,
        row.team ?? null,
        row.owner_name ?? null,
        row.owner_email ?? null,
      ]
    );

    if (result.rows[0]?.inserted) {
      created++;
    } else {
      updated++;
    }
  }

  return { updated, created };
}

/** Returns distinct internal (Anrok) participants across all call interactions, deduped by email. */
export async function getOwnerOptions(): Promise<{ name: string; email: string }[]> {
  const result = await sql.query(`
    SELECT DISTINCT ON (lower(p->>'email'))
      p->>'name'  AS name,
      p->>'email' AS email
    FROM interactions,
         jsonb_array_elements(participants) p
    WHERE p->>'affiliation' = 'Internal'
      AND p->>'name' IS NOT NULL
    ORDER BY lower(p->>'email'), p->>'name'
  `);
  return result.rows
    .map(r => ({ name: r.name as string, email: (r.email as string) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Queries deals + transcript counts matching the given filters. */
export async function queryDeals(filters: DealQueryFilters): Promise<{ deals: DealQueryRow[]; total_transcripts: number }> {
  const conditions: string[] = ["i.type = 'call'"];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.owner) {
    conditions.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements(i.participants) p
      WHERE p->>'affiliation' = 'Internal'
        AND (p->>'name' ILIKE $${idx} OR p->>'email' ILIKE $${idx})
    )`);
    params.push(`%${filters.owner}%`);
    idx++;
  }

  if (filters.dealName) {
    conditions.push(`d.name ILIKE $${idx++}`);
    params.push(`%${filters.dealName}%`);
  }

  if (filters.stage) {
    // Normalize both sides to handle underscores/caps differences
    conditions.push(`regexp_replace(lower(d.stage), '[^a-z0-9]', '', 'g') = regexp_replace(lower($${idx++}), '[^a-z0-9]', '', 'g')`);
    params.push(filters.stage);
  }

  if (filters.from) {
    conditions.push(`i.timestamp >= $${idx++}`);
    params.push(new Date(filters.from).toISOString());
  }

  if (filters.to) {
    conditions.push(`i.timestamp < $${idx++}`);
    // include the full to-day
    const toDate = new Date(filters.to);
    toDate.setDate(toDate.getDate() + 1);
    params.push(toDate.toISOString());
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const result = await sql.query(
    `SELECT
       d.id             AS deal_id,
       d.name           AS deal_name,
       d.stage,
       d.crm_id,
       COUNT(i.id)::int AS transcript_count,
       MAX(i.timestamp) AS latest_timestamp,
       (SELECT exec_summary FROM analyses WHERE deal_id = d.id ORDER BY created_at DESC LIMIT 1) AS exec_summary,
       (SELECT analysis_type FROM analyses WHERE deal_id = d.id ORDER BY created_at DESC LIMIT 1) AS analysis_type
     FROM interactions i
     JOIN deals d ON d.id = i.deal_id
     ${where}
     GROUP BY d.id, d.name, d.stage, d.crm_id
     ORDER BY MAX(i.timestamp) DESC`,
    params
  );

  const total = result.rows.reduce((s, r) => s + (r.transcript_count as number), 0);
  return { deals: result.rows as DealQueryRow[], total_transcripts: total };
}

interface GongTurn {
  speakerName?: string;
  speakerType?: string;
  timestamp?: number;
  text?: string;
}

export interface InteractionMeta {
  id: string;
  title: string | null;
  timestamp: string;
  duration: number | null;
  blob_url: string;
  deal_name: string;
  stage: string | null;
  participants: { name?: string; affiliation?: string }[] | null;
}

export const MAX_TRANSCRIPTS_DIRECT = 30;
const MAX_TURNS_PER_TRANSCRIPT = 300;

/** Shared helper: builds WHERE conditions + params for a DealQueryFilters object. */
function buildFilterConditions(filters: DealQueryFilters): { conditions: string[]; params: unknown[]; nextIdx: number } {
  const conditions: string[] = ["i.type = 'call'"];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.owners && filters.owners.length > 0) {
    conditions.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements(i.participants) p
      WHERE p->>'affiliation' = 'Internal'
        AND p->>'name' = ANY($${idx}::text[])
    )`);
    params.push(filters.owners); idx++;
  } else if (filters.owner) {
    conditions.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements(i.participants) p
      WHERE p->>'affiliation' = 'Internal'
        AND (p->>'name' ILIKE $${idx} OR p->>'email' ILIKE $${idx})
    )`);
    params.push(`%${filters.owner}%`); idx++;
  }
  if (filters.dealName) {
    conditions.push(`d.name ILIKE $${idx++}`);
    params.push(`%${filters.dealName}%`);
  }
  if (filters.stage) {
    conditions.push(`regexp_replace(lower(d.stage), '[^a-z0-9]', '', 'g') = regexp_replace(lower($${idx++}), '[^a-z0-9]', '', 'g')`);
    params.push(filters.stage);
  }
  if (filters.from) {
    conditions.push(`i.timestamp >= $${idx++}`);
    params.push(new Date(filters.from).toISOString());
  }
  if (filters.to) {
    conditions.push(`i.timestamp < $${idx++}`);
    const toDate = new Date(filters.to);
    toDate.setDate(toDate.getDate() + 1);
    params.push(toDate.toISOString());
  }

  return { conditions, params, nextIdx: idx };
}

/**
 * Returns distinct deal names matching the given filters (excluding dealName filter itself).
 * Used to populate the Deal Name dropdown dynamically.
 */
export async function getDealNames(filters: DealQueryFilters): Promise<string[]> {
  const filtersWithoutDeal = { ...filters, dealName: undefined };
  const { conditions, params } = buildFilterConditions(filtersWithoutDeal);
  const where = `WHERE ${conditions.join(' AND ')}`;

  const result = await sql.query<{ name: string }>(
    `SELECT DISTINCT d.name
     FROM interactions i
     JOIN deals d ON d.id = i.deal_id
     ${where}
     ORDER BY d.name`,
    params
  );
  return result.rows.map(r => r.name).filter(Boolean);
}

/** Returns ALL matching interactions with blob URLs — no cap. Used for map-reduce. */
export async function getAllFilteredInteractions(filters: DealQueryFilters): Promise<InteractionMeta[]> {
  const { conditions, params } = buildFilterConditions(filters);
  const where = `WHERE ${conditions.join(' AND ')}`;

  const result = await sql.query(
    `SELECT
       i.id, i.title, i.timestamp, i.duration, i.blob_url, i.participants,
       d.name AS deal_name, d.stage
     FROM interactions i
     JOIN deals d ON d.id = i.deal_id
     ${where}
     ORDER BY i.timestamp DESC`,
    params
  );
  return result.rows as InteractionMeta[];
}

function formatTurns(turns: GongTurn[]): string {
  const limited = turns.slice(0, MAX_TURNS_PER_TRANSCRIPT);
  const omitted = turns.length - limited.length;
  const lines = limited.map(t => `${t.speakerName ?? 'Unknown'}: ${t.text ?? ''}`);
  if (omitted > 0) lines.push(`... (${omitted} more turns omitted)`);
  return lines.join('\n');
}

async function fetchTranscriptTurns(blobUrl: string): Promise<GongTurn[] | null> {
  if (blobUrl.startsWith('imported://')) return null; // placeholder — not yet uploaded
  try {
    const res = await fetch(blobUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { turns?: GongTurn[] };
    return data.turns ?? null;
  } catch {
    return null;
  }
}

/** Builds a full context string for the Claude chat, including real transcript turns. */
export async function buildChatContext(filters: DealQueryFilters): Promise<string> {
  const { conditions, params } = buildFilterConditions(filters);
  const where = `WHERE ${conditions.join(' AND ')}`;

  const [interactionsResult, analysesResult] = await Promise.all([
    sql.query(
      `SELECT
         d.name AS deal_name, d.stage,
         i.id, i.title, i.timestamp, i.duration, i.participants, i.blob_url
       FROM interactions i
       JOIN deals d ON d.id = i.deal_id
       ${where}
       ORDER BY d.name, i.timestamp DESC
       LIMIT ${MAX_TRANSCRIPTS_DIRECT}`,
      params
    ),
    sql.query(
      `SELECT DISTINCT ON (a.deal_id)
         d.name AS deal_name, a.exec_summary, a.next_steps, a.analysis_type
       FROM analyses a
       JOIN deals d ON d.id = a.deal_id
       JOIN interactions i ON i.deal_id = d.id
       ${where}
       ORDER BY a.deal_id, a.created_at DESC`,
      params
    ),
  ]);

  const analysisMap = new Map<string, typeof analysesResult.rows[0]>();
  for (const row of analysesResult.rows) {
    analysisMap.set(row.deal_name as string, row);
  }

  // Group by deal
  const byDeal = new Map<string, typeof interactionsResult.rows>();
  for (const row of interactionsResult.rows) {
    const key = row.deal_name as string;
    if (!byDeal.has(key)) byDeal.set(key, []);
    byDeal.get(key)!.push(row);
  }

  // Fetch transcript content concurrently
  const turnsMap = new Map<string, GongTurn[] | null>();
  await Promise.all(
    interactionsResult.rows.map(async row => {
      const turns = await fetchTranscriptTurns(row.blob_url as string);
      turnsMap.set(row.id as string, turns);
    })
  );

  const totalTranscripts = interactionsResult.rows.length;
  const omittedTranscripts = 0;

  const lines: string[] = [
    `You are an expert sales analyst AI for Anrok. You have access to ${totalTranscripts} sales call transcript(s) across ${byDeal.size} deal(s).`,
    omittedTranscripts > 0 ? `Note: ${omittedTranscripts} additional transcripts were omitted from context due to size limits.` : '',
    '',
  ].filter(l => l !== undefined);

  for (const [dealName, rows] of byDeal) {
    const stage = rows[0]?.stage ?? 'Unknown';
    lines.push(`${'='.repeat(60)}`);
    lines.push(`DEAL: ${dealName} | Stage: ${stage}`);
    lines.push(`${'='.repeat(60)}`);

    for (const row of rows) {
      const date = new Date(row.timestamp as string).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      const dur = row.duration ? `${Math.floor((row.duration as number) / 60)}m` : '';
      const participants = Array.isArray(row.participants)
        ? (row.participants as { name?: string; affiliation?: string }[])
            .map(p => `${p.name ?? ''}${p.affiliation === 'Internal' ? ' [Anrok]' : ' [Customer]'}`)
            .filter(Boolean).join(', ')
        : '';

      lines.push('');
      lines.push(`--- Call: "${row.title ?? 'Untitled'}" | ${date}${dur ? ` | ${dur}` : ''} ---`);
      if (participants) lines.push(`Participants: ${participants}`);

      const turns = turnsMap.get(row.id as string);
      if (turns && turns.length > 0) {
        lines.push('');
        lines.push('Transcript:');
        lines.push(formatTurns(turns));
      } else {
        lines.push('(Transcript content not yet uploaded — metadata only)');
      }
    }

    const analysis = analysisMap.get(dealName);
    if (analysis) {
      lines.push('');
      lines.push(`--- AI Analysis (${analysis.analysis_type}) ---`);
      if (analysis.exec_summary) lines.push(`Summary: ${analysis.exec_summary}`);
      if (analysis.next_steps) lines.push(`Next Steps: ${analysis.next_steps}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
