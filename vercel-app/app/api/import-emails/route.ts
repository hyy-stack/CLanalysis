import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey, isAuthError } from '@/lib/auth/api-key';
import { uploadEmail } from '@/lib/blob/storage';
import { upsertDeal, createManualEmail, getDealByCrmId } from '@/lib/db/client';
import { randomUUID } from 'crypto';

/**
 * Email Import API
 * POST /api/import-emails
 * 
 * Accepts JSON with array of emails to import
 * Requires API key authentication
 */

const EmailSchema = z.object({
  crmId: z.string().min(1),
  subject: z.string(),
  from: z.string().email(),
  to: z.string().email(),
  timestamp: z.string().datetime(),
  body: z.string(),
});

const ImportRequestSchema = z.object({
  emails: z.array(EmailSchema),
  triggerAnalysis: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    // Require API key for this endpoint
    const authResult = await requireApiKey(request);
    if (isAuthError(authResult)) return authResult;
    
    const body = await request.json();
    
    // Validate input
    const parsed = ImportRequestSchema.parse(body);
    const { emails, triggerAnalysis } = parsed;
    
    console.log(`[Email Import] Processing ${emails.length} email(s)`);
    
    const importBatchId = randomUUID();
    const results = {
      imported: 0,
      failed: 0,
      errors: [] as string[],
      dealIds: new Set<string>(),
    };
    
    for (const email of emails) {
      try {
        // Ensure deal exists
        let deal = await getDealByCrmId(email.crmId);
        
        if (!deal) {
          // Create deal if it doesn't exist
          deal = await upsertDeal(email.crmId, {
            name: email.subject, // Use email subject as placeholder name
            stage: 'active',
          });
        }
        
        // Upload email body to Blob
        const emailId = `${email.crmId}-${Date.now()}`;
        const blobUrl = await uploadEmail(emailId, email.body);
        
        // Create manual email record
        await createManualEmail(deal.id, {
          subject: email.subject,
          fromEmail: email.from,
          toEmail: email.to,
          timestamp: email.timestamp,
          blobUrl,
          importBatchId,
        });
        
        results.imported++;
        results.dealIds.add(deal.id);
        
        console.log(`[Email Import] ✓ Imported email for deal ${deal.crm_id}`);
        
      } catch (error) {
        results.failed++;
        results.errors.push(`CRM ID ${email.crmId}: ${(error as Error).message}`);
        console.error(`[Email Import] ✗ Failed to import:`, error);
      }
    }
    
    console.log(`[Email Import] Complete: ${results.imported} imported, ${results.failed} failed`);
    
    // Optionally trigger analysis for affected deals
    if (triggerAnalysis && results.dealIds.size > 0) {
      console.log(`[Email Import] Triggering analysis for ${results.dealIds.size} deal(s)`);
      
      // Trigger analysis asynchronously (don't wait for completion)
      for (const dealId of results.dealIds) {
        fetch(`${request.nextUrl.origin}/api/analyze-deal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealId }),
        }).catch(err => {
          console.error(`[Email Import] Failed to trigger analysis for ${dealId}:`, err);
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      imported: results.imported,
      failed: results.failed,
      errors: results.errors,
      dealsAffected: results.dealIds.size,
    });
    
  } catch (error) {
    console.error('[Email Import] Error:', error);
    
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

