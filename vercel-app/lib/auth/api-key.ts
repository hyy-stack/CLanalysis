import { NextRequest, NextResponse } from 'next/server';

/**
 * API Key authentication utilities
 * For protecting manual/script endpoints like analyze-deal and import-emails
 */

/**
 * Check if request is from internal/trusted source
 * Trusted sources: same Vercel deployment, Slack (signed), Gong webhook handler
 */
function isInternalRequest(request: NextRequest): boolean {
  // Check for internal bypass header (set by our own endpoints)
  const internalToken = request.headers.get('x-internal-call');
  if (internalToken === process.env.VERCEL_DEPLOYMENT_ID || internalToken === 'internal') {
    return true;
  }
  
  // Requests from localhost during development
  const host = request.headers.get('host') || '';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return true;
  }
  
  return false;
}

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
 * Allows internal/trusted requests to bypass
 */
export function requireApiKey(request: NextRequest): NextResponse | null {
  // Allow internal requests to bypass API key
  if (isInternalRequest(request)) {
    console.log('[API Auth] Internal request, bypassing API key check');
    return null;
  }
  
  if (!verifyApiKey(request)) {
    console.error('[API Auth] Invalid or missing API key');
    return NextResponse.json({ 
      error: 'Unauthorized',
      message: 'Valid API key required. Include X-API-Key header.' 
    }, { status: 401 });
  }
  
  return null;
}

