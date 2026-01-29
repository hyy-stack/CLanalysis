import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/api-key';
import { getDealByCrmId } from '@/lib/db/client';
import { createSalesforceClient } from '@/lib/salesforce/client';
import { createGoogleSheetsClient } from '@/lib/google/sheets';

/**
 * Deal Tracking API
 * POST /api/track-deal
 *
 * Fetches deal data from Salesforce and writes to Google Sheets
 * Requires API key authentication
 */

const TrackRequestSchema = z.object({
  crmId: z.string(),
  // Optional Claude-generated fields
  dealSummary: z.string().optional(),
  currentNextSteps: z.string().optional(),
  untappedOpportunities: z.string().optional(),
  risks: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    console.log('[Track Deal] Request received');

    // Require API key for this endpoint
    const authError = requireApiKey(request);
    if (authError) {
      console.error('[Track Deal] Auth failed');
      return authError;
    }

    const body = await request.json();
    const { crmId, dealSummary, currentNextSteps, untappedOpportunities, risks } = TrackRequestSchema.parse(body);

    console.log('[Track Deal] Tracking deal:', crmId);

    // Check if we have Salesforce client
    const salesforceClient = createSalesforceClient();
    if (!salesforceClient) {
      return NextResponse.json({
        success: false,
        error: 'Salesforce not configured',
      }, { status: 500 });
    }

    // Check if we have Google Sheets client
    const sheetsClient = createGoogleSheetsClient();
    if (!sheetsClient) {
      return NextResponse.json({
        success: false,
        error: 'Google Sheets not configured',
      }, { status: 500 });
    }

    // Fetch data from Salesforce
    console.log('[Track Deal] Fetching from Salesforce...');
    const sfFields = await salesforceClient.getOpportunityFields(crmId);
    const opportunity = await salesforceClient.getOpportunity(crmId);

    if (!opportunity) {
      return NextResponse.json({
        success: false,
        error: 'Opportunity not found in Salesforce',
      }, { status: 404 });
    }

    // Write to Google Sheets
    console.log('[Track Deal] Writing to Google Sheets...');
    await sheetsClient.upsertDealTracking({
      opportunity: opportunity.Name,
      account: sfFields.accountName || '',
      opportunityOwner: sfFields.ownerName || '',
      arr: sfFields.arr,
      closeDate: sfFields.closeDate,
      oppStage: sfFields.stageName || '',
      probability: sfFields.probability,
      dealSummary,
      currentNextSteps,
      untappedOpportunities,
      risks,
    });

    console.log('[Track Deal] Successfully tracked deal');

    return NextResponse.json({
      success: true,
      data: {
        opportunity: opportunity.Name,
        account: sfFields.accountName,
        owner: sfFields.ownerName,
        arr: sfFields.arr,
        closeDate: sfFields.closeDate,
        stage: sfFields.stageName,
        probability: sfFields.probability,
      },
    });

  } catch (error) {
    console.error('[Track Deal] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: (error as Error).message,
    }, { status: 500 });
  }
}
