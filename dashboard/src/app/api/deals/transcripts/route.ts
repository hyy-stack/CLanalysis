import { NextRequest, NextResponse } from 'next/server';
import { getTranscriptsByDeal } from '@/lib/db';

export async function GET(req: NextRequest) {
  const dealName = req.nextUrl.searchParams.get('dealName');
  if (!dealName) {
    return NextResponse.json({ error: 'dealName is required' }, { status: 400 });
  }

  try {
    const transcripts = await getTranscriptsByDeal(dealName);
    return NextResponse.json({ transcripts });
  } catch (err) {
    console.error('[GET /api/deals/transcripts]', err);
    return NextResponse.json({ error: 'Failed to fetch transcripts' }, { status: 500 });
  }
}
