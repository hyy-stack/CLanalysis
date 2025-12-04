import { createHmac } from 'crypto';

/**
 * Verify Slack request signature
 * Slack signs all requests to verify they came from Slack
 * 
 * @param body - Raw request body string
 * @param timestamp - X-Slack-Request-Timestamp header
 * @param signature - X-Slack-Signature header
 * @param signingSecret - Your Slack app's signing secret
 * @returns true if signature is valid
 */
export function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string,
  signingSecret: string
): boolean {
  // Prevent replay attacks - reject requests older than 5 minutes
  const requestTime = parseInt(timestamp);
  const currentTime = Math.floor(Date.now() / 1000);
  
  if (Math.abs(currentTime - requestTime) > 300) {
    console.error('[Slack Auth] Request too old:', currentTime - requestTime, 'seconds');
    return false;
  }
  
  // Compute expected signature
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = createHmac('sha256', signingSecret);
  const computed = 'v0=' + hmac.update(sigBasestring).digest('hex');
  
  // Compare signatures (timing-safe comparison)
  return computed === signature;
}

