/**
 * Slack channel routing based on deal segment
 *
 * Configure via environment variables:
 *   SLACK_CHANNEL_ID - Default channel (always receives all deals)
 *   SLACK_CHANNEL_ENTERPRISE - Additional channel(s) for Enterprise segment
 *   SLACK_CHANNEL_COMMERCIAL - Additional channel(s) for Commercial segment
 *   SLACK_CHANNEL_MID_MARKET - Additional channel(s) for Mid-Market segment
 *   SLACK_CHANNEL_OTHER - Additional channel(s) for Other segment
 *
 * Multiple channels can be specified as comma-separated values:
 *   SLACK_CHANNEL_COMMERCIAL=C123ABC,C456DEF
 */

export type RoleSegment = 'Enterprise' | 'Commercial' | 'Mid-Market' | 'Other';

const SEGMENT_ENV_MAP: Record<RoleSegment, string> = {
  'Enterprise': 'SLACK_CHANNEL_ENTERPRISE',
  'Commercial': 'SLACK_CHANNEL_COMMERCIAL',
  'Mid-Market': 'SLACK_CHANNEL_MID_MARKET',
  'Other': 'SLACK_CHANNEL_OTHER',
};

/**
 * Parse comma-separated channel IDs from env var
 */
function parseChannels(envValue: string | undefined): string[] {
  if (!envValue) return [];
  return envValue
    .split(',')
    .map(ch => ch.trim())
    .filter(ch => ch.length > 0);
}

/**
 * Get all Slack channels for a given segment
 * Always includes the default channel, plus any segment-specific channels
 */
export function getChannelsForSegment(segment: string | undefined | null): string[] {
  const channels = new Set<string>();

  // Always include default channel
  const defaultChannel = process.env.SLACK_CHANNEL_ID;
  if (defaultChannel) {
    channels.add(defaultChannel);
  }

  // Add segment-specific channels if segment is valid
  if (segment && segment in SEGMENT_ENV_MAP) {
    const envVar = SEGMENT_ENV_MAP[segment as RoleSegment];
    const segmentChannels = parseChannels(process.env[envVar]);
    for (const ch of segmentChannels) {
      channels.add(ch);
    }
  }

  return Array.from(channels);
}

/**
 * Check if a segment is valid
 */
export function isValidSegment(segment: string | undefined | null): segment is RoleSegment {
  if (!segment) return false;
  return segment in SEGMENT_ENV_MAP;
}
