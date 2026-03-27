import { NextRequest, NextResponse } from 'next/server';
import { importDealMetadata } from '@/lib/db';
import type { CsvRow } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows: CsvRow[] = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }
    const result = await importDealMetadata(rows);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[POST /api/import]', err);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
