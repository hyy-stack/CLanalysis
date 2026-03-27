import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const backendUrl = process.env.BACKEND_URL;
    const apiKey = process.env.INTERNAL_API_KEY;

    if (!backendUrl) {
      return NextResponse.json({ error: 'BACKEND_URL not configured' }, { status: 500 });
    }

    const response = await fetch(`${backendUrl}/api/analyze-deal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error('[POST /api/analyze]', err);
    return NextResponse.json({ error: 'Analysis request failed' }, { status: 500 });
  }
}
