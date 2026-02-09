import { NextRequest, NextResponse } from 'next/server';
import { hashKey, isApiKeyFormat } from './key-generator';
import { findApiKeyByHash, updateApiKeyLastUsed } from '@/lib/db/client';

/**
 * API Key authentication utilities
 * Supports both legacy INTERNAL_API_KEY and new multi-client dak_* keys
 */

/**
 * Result of successful authentication
 */
export interface AuthResult {
  type: 'internal' | 'legacy' | 'api_key';
  apiKeyId?: string;
  apiKeyName?: string;
  apiKeyPrefix?: string;
}

/**
 * Check if request is from internal/trusted source
 * Trusted sources: same Vercel deployment, localhost
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
 * Extract API key from request headers
 */
function extractApiKey(request: NextRequest): string | null {
  return request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '') || null;
}

/**
 * Verify against legacy INTERNAL_API_KEY
 */
function verifyLegacyKey(apiKey: string): boolean {
  const validKey = process.env.INTERNAL_API_KEY;

  if (!validKey) {
    return false;
  }

  return apiKey === validKey;
}

/**
 * Require API key for an endpoint (async for database lookup)
 * Returns AuthResult on success, NextResponse error on failure
 *
 * Auth check order:
 * 1. Internal requests → bypass
 * 2. Legacy INTERNAL_API_KEY → works as before
 * 3. New dak_* keys → database lookup
 */
export async function requireApiKey(request: NextRequest): Promise<AuthResult | NextResponse> {
  // 1. Allow internal requests to bypass API key
  if (isInternalRequest(request)) {
    console.log('[API Auth] Internal request, bypassing API key check');
    return { type: 'internal' };
  }

  const apiKey = extractApiKey(request);

  if (!apiKey) {
    console.error('[API Auth] Missing API key');
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Valid API key required. Include X-API-Key header.',
      },
      { status: 401 }
    );
  }

  // 2. Check legacy key first (fast path, no DB)
  if (verifyLegacyKey(apiKey)) {
    console.log('[API Auth] Legacy key authenticated');
    return { type: 'legacy' };
  }

  // 3. Check for new dak_* format keys
  if (isApiKeyFormat(apiKey)) {
    const keyHash = hashKey(apiKey);

    try {
      const keyRecord = await findApiKeyByHash(keyHash);

      if (keyRecord) {
        // Update last_used_at asynchronously (don't block response)
        updateApiKeyLastUsed(keyRecord.id).catch((err) => {
          console.error('[API Auth] Failed to update last_used_at:', err);
        });

        console.log(`[API Auth] Key "${keyRecord.name}" (${keyRecord.key_prefix}...) authenticated`);
        return {
          type: 'api_key',
          apiKeyId: keyRecord.id,
          apiKeyName: keyRecord.name,
          apiKeyPrefix: keyRecord.key_prefix,
        };
      }
    } catch (err) {
      console.error('[API Auth] Database error during key lookup:', err);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Authentication service unavailable',
        },
        { status: 500 }
      );
    }
  }

  // Key not found or invalid format
  console.error('[API Auth] Invalid or revoked API key');
  return NextResponse.json(
    {
      error: 'Unauthorized',
      message: 'Invalid or revoked API key.',
    },
    { status: 401 }
  );
}

/**
 * Helper to check if a result is an error response
 */
export function isAuthError(result: AuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
