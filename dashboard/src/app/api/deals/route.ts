import { NextRequest, NextResponse } from 'next/server';
import { getDeals } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const result = await getDeals({
      stage: searchParams.get('stage') ?? undefined,
      team: searchParams.get('team') ?? undefined,
      owner_email: searchParams.get('person') ?? undefined,
      contact_email: searchParams.get('email') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      page: parseInt(searchParams.get('page') ?? '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') ?? '25', 10),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[GET /api/deals]', err);
    return NextResponse.json({ error: 'Failed to fetch deals' }, { status: 500 });
  }
}
