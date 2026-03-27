import { NextResponse } from 'next/server';
import { getFilterOptions } from '@/lib/db';

export async function GET() {
  try {
    const filters = await getFilterOptions();
    return NextResponse.json(filters);
  } catch (err) {
    console.error('[GET /api/filters]', err);
    return NextResponse.json({ error: 'Failed to fetch filters' }, { status: 500 });
  }
}
