import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey, isAuthError } from '@/lib/auth/api-key';
import { getDealByCrmId, getLatestAnalysis } from '@/lib/db/client';
import { createSalesforceClient } from '@/lib/salesforce/client';
import { createGoogleSheetsClient } from '@/lib/google/sheets';
import type { ComEnhancedStructuredData } from '@/types/database';

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
    const authResult = await requireApiKey(request);
    if (isAuthError(authResult)) {
      console.error('[Track Deal] Auth failed');
      return authResult;
    }
    if (authResult.apiKeyName) {
      console.log(`[Track Deal] Authenticated via key: ${authResult.apiKeyName}`);
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

    // Get deal from DB to fetch latest analysis
    const deal = await getDealByCrmId(crmId);
    let analysisFields: {
      dealSummary: string;
      currentNextSteps: string;
      untappedOpportunities: string;
      risks: string;
      anrokProbability: number | null;
    } = {
      dealSummary: dealSummary || '',
      currentNextSteps: currentNextSteps || '',
      untappedOpportunities: untappedOpportunities || '',
      risks: risks || '',
      anrokProbability: null,
    };

    // If fields not provided in request, try to get from latest analysis
    if (deal && (!dealSummary || !currentNextSteps)) {
      const latestAnalysis = await getLatestAnalysis(deal.id);
      if (latestAnalysis) {
        const structured = latestAnalysis.structured_data as ComEnhancedStructuredData | undefined;
        if (structured) {
          console.log('[Track Deal] Using structured data from analysis:', latestAnalysis.id);
          analysisFields = {
            dealSummary: dealSummary || structured.dealSummary || '',
            currentNextSteps: currentNextSteps || structured.currentNextSteps || '',
            untappedOpportunities: untappedOpportunities || structured.untappedOpportunities || '',
            risks: risks || structured.criticalIssues?.join(', ') || '',
            anrokProbability: structured.probability ?? null,
          };
        } else {
          // Fall back to exec_summary and next_steps from non-structured analysis
          console.log('[Track Deal] Using non-structured data from analysis:', latestAnalysis.id);
          analysisFields = {
            dealSummary: dealSummary || latestAnalysis.exec_summary || '',
            currentNextSteps: currentNextSteps || latestAnalysis.next_steps || '',
            untappedOpportunities: untappedOpportunities || '',
            risks: risks || '',
            anrokProbability: null,
          };
        }
      }
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
      sfdcProbability: sfFields.probability,
      ...analysisFields,
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
