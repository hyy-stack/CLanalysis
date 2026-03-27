import { NextRequest, NextResponse } from 'next/server';
import { getDealNames } from '@/lib/db';
import type { DealQueryFilters } from '@/lib/types';

/**
 * GET /api/deals/names
 * Returns distinct deal names matching the given filters (owner/owners/stage/from/to).
 * Used to populate the Deal Name autocomplete dropdown.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const filters: DealQueryFilters = {
    owner:    sp.get('owner')    ?? undefined,
    owners:   sp.get('owners')   ? sp.get('owners')!.split(',').filter(Boolean) : undefined,
    stage:    sp.get('stage')    ?? undefined,
    from:     sp.get('from')     ?? undefined,
    to:       sp.get('to')       ?? undefined,
  };

  try {
    const names = await getDealNames(filters);
    return NextResponse.json({ names });
  } catch (err) {
    console.error('[GET /api/deals/names]', err);
    return NextResponse.json({ error: 'Failed to fetch deal names' }, { status: 500 });
  }
}
