import { NextRequest, NextResponse } from 'next/server';
import { queryDeals, getOwnerOptions } from '@/lib/db';
import type { DealQueryFilters } from '@/lib/types';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const filters: DealQueryFilters = {
    owner:    sp.get('owner')    ?? undefined,
    dealName: sp.get('dealName') ?? undefined,
    stage:    sp.get('stage')    ?? undefined,
    from:     sp.get('from')     ?? undefined,
    to:       sp.get('to')       ?? undefined,
  };

  try {
    const [result, owners] = await Promise.all([
      queryDeals(filters),
      getOwnerOptions(),
    ]);
    return NextResponse.json({ ...result, owners });
  } catch (err) {
    console.error('[GET /api/deals/query]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
