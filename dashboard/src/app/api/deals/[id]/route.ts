import { NextRequest, NextResponse } from 'next/server';
import { getDealById } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deal = await getDealById(id);
    if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    return NextResponse.json(deal);
  } catch (err) {
    console.error('[GET /api/deals/:id]', err);
    return NextResponse.json({ error: 'Failed to fetch deal' }, { status: 500 });
  }
}
