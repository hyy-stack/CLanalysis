import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getDealByCrmId,
  getDealById,
  getInteractionsForDeal,
  getManualEmailsForDeal,
  getAnalysesForDeal,
} from '@/lib/db/client';

/**
 * View Deal API
 * GET /api/view-deal?crmId=... or ?dealId=...
 * 
 * Returns complete deal information with all interactions and analyses
 */

// Mark as dynamic since we use searchParams
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const crmId = searchParams.get('crmId');
    const dealId = searchParams.get('dealId');
    
    if (!crmId && !dealId) {
      return NextResponse.json({
        error: 'Either crmId or dealId parameter is required',
      }, { status: 400 });
    }
    
    // Fetch deal
    const deal = crmId 
      ? await getDealByCrmId(crmId)
      : await getDealById(dealId!);
    
    if (!deal) {
      return NextResponse.json({
        error: 'Deal not found',
      }, { status: 404 });
    }
    
    // Fetch all related data
    const interactions = await getInteractionsForDeal(deal.id);
    const manualEmails = await getManualEmailsForDeal(deal.id);
    const analyses = await getAnalysesForDeal(deal.id);
    
    // Format interactions for display
    const formattedInteractions = interactions.map(i => ({
      id: i.id,
      type: i.type,
      title: i.title,
      timestamp: i.timestamp,
      duration: i.duration,
      participants: i.participants,
      source: i.source,
      blobUrl: i.blob_url,
      externalId: i.external_id,
    }));
    
    // Format emails
    const formattedEmails = manualEmails.map(e => ({
      id: e.id,
      subject: e.subject,
      from: e.from_email,
      to: e.to_email,
      timestamp: e.timestamp,
      blobUrl: e.blob_url,
    }));
    
    // Format analyses
    const formattedAnalyses = analyses.map(a => ({
      id: a.id,
      type: a.analysis_type,
      execSummary: a.exec_summary,
      nextSteps: a.next_steps,
      slackThread: a.slack_thread_ts,
      createdAt: a.created_at,
    }));
    
    return NextResponse.json({
      deal: {
        id: deal.id,
        crmId: deal.crm_id,
        name: deal.name,
        stage: deal.stage,
        amount: deal.amount,
        currency: deal.currency,
        accountName: deal.account_name,
        createdAt: deal.created_at,
        updatedAt: deal.updated_at,
      },
      interactions: formattedInteractions,
      manualEmails: formattedEmails,
      analyses: formattedAnalyses,
      summary: {
        totalInteractions: interactions.length + manualEmails.length,
        calls: interactions.filter(i => i.type === 'call').length,
        emails: interactions.filter(i => i.type === 'email').length + manualEmails.length,
        analyses: analyses.length,
        latestActivity: interactions.length > 0 
          ? interactions[interactions.length - 1].timestamp
          : manualEmails.length > 0
          ? manualEmails[manualEmails.length - 1].timestamp
          : deal.created_at,
      },
    });
    
  } catch (error) {
    console.error('[View Deal] Error:', error);
    
    return NextResponse.json({
      error: (error as Error).message,
    }, { status: 500 });
  }
}

