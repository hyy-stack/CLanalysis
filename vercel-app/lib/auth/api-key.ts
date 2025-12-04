import { NextRequest, NextResponse } from 'next/server';

/**
 * API Key authentication utilities
 * For protecting manual/script endpoints like analyze-deal and import-emails
 */

/**
 * Verify API key from request headers
 */
export function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
  const validKey = process.env.INTERNAL_API_KEY;
  
  if (!validKey) {
    console.error('[API Auth] INTERNAL_API_KEY not configured');
    return false;
  }
  
  return apiKey === validKey;
}

/**
 * Require API key for an endpoint
 * Returns error response if invalid, null if valid
 */
export function requireApiKey(request: NextRequest): NextResponse | null {
  if (!verifyApiKey(request)) {
    console.error('[API Auth] Invalid or missing API key');
    return NextResponse.json({ 
      error: 'Unauthorized',
      message: 'Valid API key required. Include X-API-Key header.' 
    }, { status: 401 });
  }
  
  return null;
}

