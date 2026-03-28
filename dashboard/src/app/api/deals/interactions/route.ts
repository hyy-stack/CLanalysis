import { NextRequest, NextResponse } from 'next/server';
import { getFilteredTranscriptList } from '@/lib/db';
import type { DealQueryFilters } from '@/lib/types';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const filters: DealQueryFilters = {
    owner:    p.get('owner')    ?? undefined,
    owners:   p.get('owners')   ? p.get('owners')!.split(',') : undefined,
    dealName: p.get('dealName') ?? undefined,
    stage:    p.get('stage')    ?? undefined,
    from:     p.get('from')     ?? undefined,
    to:       p.get('to')       ?? undefined,
  };

  try {
    const transcripts = await getFilteredTranscriptList(filters);
    return NextResponse.json({ transcripts });
  } catch (err) {
    console.error('[GET /api/deals/interactions]', err);
    return NextResponse.json({ error: 'Failed to fetch transcripts' }, { status: 500 });
  }
}
