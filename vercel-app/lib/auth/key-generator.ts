import { randomBytes, createHash } from 'crypto';

/**
 * API Key generation and hashing utilities
 * Key format: dak_<32-hex-chars> (128 bits of entropy)
 */

const KEY_PREFIX = 'dak_';
const KEY_BYTES = 16; // 128 bits = 16 bytes = 32 hex chars

/**
 * Generate a new API key
 * Returns the raw key (to give to client) and its hash (for storage)
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const randomPart = randomBytes(KEY_BYTES).toString('hex');
  const key = `${KEY_PREFIX}${randomPart}`;

  return {
    key,
    hash: hashKey(key),
    prefix: getKeyPrefix(key),
  };
}

/**
 * Hash a key using SHA-256
 */
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Get the prefix portion of a key for logging
 * Returns first 8 characters (e.g., "dak_a1b2")
 */
export function getKeyPrefix(key: string): string {
  return key.substring(0, 8);
}

/**
 * Check if a key looks like our API key format
 */
export function isApiKeyFormat(key: string): boolean {
  // dak_ + 32 hex chars = 36 total
  return key.startsWith(KEY_PREFIX) && key.length === 36 && /^dak_[a-f0-9]{32}$/.test(key);
}
