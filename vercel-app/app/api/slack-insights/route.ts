import { NextRequest, NextResponse } from 'next/server';

/**
 * Legacy Insights Endpoint
 *
 * This endpoint has been split into three specific endpoints:
 * - /api/prospect-insights - Active deals (pre-sales)
 * - /api/customer-insights - Closed won (post-sales)
 * - /api/closed-lost-insights - Closed lost (why we lost)
 *
 * This endpoint now returns guidance to use the new endpoints.
 */

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';

  // For Slack slash commands, return helpful message
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `The /insights command has been replaced with specific commands:

• \`/prospect-insights [days]\` - Feedback from prospects evaluating Anrok
• \`/customer-insights [days]\` - Feedback from existing customers
• \`/closed-lost-insights [days]\` - Analysis of why deals were lost

Please use one of these commands instead.`,
    });
  }

  // For API calls, return JSON guidance
  return NextResponse.json({
    error: 'This endpoint has been deprecated',
    message: 'Please use the specific insight endpoints',
    endpoints: {
      prospects: '/api/prospect-insights',
      customers: '/api/customer-insights',
      closedLost: '/api/closed-lost-insights',
    },
  }, { status: 410 });
}
