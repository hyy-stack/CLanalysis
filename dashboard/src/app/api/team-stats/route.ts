import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getTeamMembers, ROSTER } from '@/lib/roles';

export interface MemberStats {
  name: string;
  role: string;
  deal_count: number;
  transcript_count: number;
  by_stage: { stage: string; deals: number; transcripts: number }[];
}

/**
 * GET /api/team-stats
 *   ?manager=<name>          — filter to direct reports of this manager
 *   &owners=A,B,C            — further restrict to these names (comma-separated)
 *   &stage=<stage>           — filter by deal stage
 *   &dealName=<text>         — deal name ILIKE search
 *   &from=YYYY-MM-DD         — call timestamp ≥
 *   &to=YYYY-MM-DD           — call timestamp ≤ (inclusive day)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const manager   = sp.get('manager')  ?? '';
  const ownersRaw = sp.get('owners')   ?? '';
  const stage     = sp.get('stage')    ?? '';
  const dealName  = sp.get('dealName') ?? '';
  const from      = sp.get('from')     ?? '';
  const to        = sp.get('to')       ?? '';

  // Base member list from manager
  let members = manager ? getTeamMembers(manager) : ROSTER;
  if (members.length === 0) return NextResponse.json({ members: [] });

  // Further restrict to specific owners if provided
  if (ownersRaw) {
    const selected = new Set(ownersRaw.split(',').map(s => s.trim()).filter(Boolean));
    members = members.filter(m => selected.has(m.name));
    if (members.length === 0) return NextResponse.json({ members: [] });
  }

  const names = members.map(m => m.name);

  // Build dynamic WHERE clauses
  const conditions: string[] = [
    `i.type = 'call'`,
    `p->>'affiliation' = 'Internal'`,
    `p->>'name' = ANY($1::text[])`,
  ];
  const params: unknown[] = [names];
  let idx = 2;

  if (stage) {
    conditions.push(
      `regexp_replace(lower(d.stage), '[^a-z0-9]', '', 'g') = regexp_replace(lower($${idx++}), '[^a-z0-9]', '', 'g')`
    );
    params.push(stage);
  }
  if (dealName) {
    conditions.push(`d.name ILIKE $${idx++}`);
    params.push(`%${dealName}%`);
  }
  if (from) {
    conditions.push(`i.timestamp >= $${idx++}`);
    params.push(new Date(from).toISOString());
  }
  if (to) {
    conditions.push(`i.timestamp < $${idx++}`);
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    params.push(toDate.toISOString());
  }

  const where = conditions.join(' AND ');

  try {
    const result = await sql.query<{
      owner_name: string;
      stage: string | null;
      deal_count: string;
      transcript_count: string;
    }>(
      `SELECT
         p->>'name'           AS owner_name,
         d.stage,
         COUNT(DISTINCT d.id) AS deal_count,
         COUNT(i.id)          AS transcript_count
       FROM interactions i
       JOIN deals d ON d.id = i.deal_id,
       jsonb_array_elements(i.participants) p
       WHERE ${where}
       GROUP BY p->>'name', d.stage`,
      params
    );

    const statsMap = new Map<string, MemberStats>();
    for (const m of members) {
      statsMap.set(m.name, { name: m.name, role: m.role, deal_count: 0, transcript_count: 0, by_stage: [] });
    }
    for (const row of result.rows) {
      const s = statsMap.get(row.owner_name);
      if (!s) continue;
      const dc = parseInt(row.deal_count, 10);
      const tc = parseInt(row.transcript_count, 10);
      s.deal_count += dc;
      s.transcript_count += tc;
      if (row.stage) s.by_stage.push({ stage: row.stage, deals: dc, transcripts: tc });
    }

    return NextResponse.json({ members: Array.from(statsMap.values()) });
  } catch (err) {
    console.error('[GET /api/team-stats]', err);
    return NextResponse.json({ error: 'Failed to fetch team stats' }, { status: 500 });
  }
}
