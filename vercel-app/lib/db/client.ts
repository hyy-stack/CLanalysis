import { sql } from '@vercel/postgres';
import type { Deal, Interaction, Analysis, ManualEmail } from '@/types/database';

/**
 * Database client for Vercel Postgres operations
 */

/**
 * Upsert a deal (create or update by CRM ID)
 */
export async function upsertDeal(
  crmId: string,
  data: {
    name: string;
    stage: string;
    amount?: number;
    currency?: string;
    accountName?: string;
    opportunityType?: string;
    ownerName?: string;
  }
): Promise<Deal> {
  const result = await sql`
    INSERT INTO deals (crm_id, name, stage, amount, currency, account_name, opportunity_type, owner_name)
    VALUES (${crmId}, ${data.name}, ${data.stage}, ${data.amount || null}, ${data.currency || 'USD'}, ${data.accountName || null}, ${data.opportunityType || null}, ${data.ownerName || null})
    ON CONFLICT (crm_id) 
    DO UPDATE SET
      name = EXCLUDED.name,
      stage = EXCLUDED.stage,
      amount = COALESCE(EXCLUDED.amount, deals.amount),
      currency = COALESCE(EXCLUDED.currency, deals.currency),
      account_name = COALESCE(EXCLUDED.account_name, deals.account_name),
      opportunity_type = COALESCE(EXCLUDED.opportunity_type, deals.opportunity_type),
      owner_name = COALESCE(EXCLUDED.owner_name, deals.owner_name),
      updated_at = NOW()
    RETURNING *
  `;
  
  return result.rows[0] as Deal;
}

/**
 * Get deal by CRM ID
 */
export async function getDealByCrmId(crmId: string): Promise<Deal | null> {
  const result = await sql`
    SELECT * FROM deals WHERE crm_id = ${crmId}
  `;
  
  return result.rows[0] as Deal || null;
}

/**
 * Get deal by internal ID
 */
export async function getDealById(id: string): Promise<Deal | null> {
  const result = await sql`
    SELECT * FROM deals WHERE id = ${id}
  `;
  
  return result.rows[0] as Deal || null;
}

/**
 * Create an interaction (call or email)
 */
export async function createInteraction(
  dealId: string | null,
  type: 'call' | 'email',
  externalId: string,
  blobUrl: string,
  metadata: {
    title?: string;
    timestamp: string;
    duration?: number;
    participants?: any[];
    source: 'gong_webhook' | 'manual_import' | 'gong_api';
  }
): Promise<Interaction> {
  const result = await sql`
    INSERT INTO interactions (
      deal_id, external_id, type, title, timestamp, duration, 
      participants, blob_url, source, metadata
    )
    VALUES (
      ${dealId}, ${externalId}, ${type}, ${metadata.title || null},
      ${metadata.timestamp}, ${metadata.duration || null},
      ${JSON.stringify(metadata.participants || [])}, ${blobUrl},
      ${metadata.source}, ${JSON.stringify(metadata)}
    )
    ON CONFLICT (external_id) DO NOTHING
    RETURNING *
  `;
  
  return result.rows[0] as Interaction;
}

/**
 * Check if interaction already exists
 */
export async function interactionExists(externalId: string): Promise<boolean> {
  const result = await sql`
    SELECT EXISTS(SELECT 1 FROM interactions WHERE external_id = ${externalId})
  `;
  
  return result.rows[0].exists;
}

/**
 * Get all interactions for a deal, sorted chronologically
 * By default, excludes flagged interactions
 */
export async function getInteractionsForDeal(dealId: string, includeExcluded: boolean = false): Promise<Interaction[]> {
  let query;
  
  if (includeExcluded) {
    query = sql`
      SELECT * FROM interactions 
      WHERE deal_id = ${dealId}
      ORDER BY timestamp ASC
    `;
  } else {
    query = sql`
      SELECT * FROM interactions 
      WHERE deal_id = ${dealId}
      AND (metadata->>'excluded' IS NULL OR metadata->>'excluded' != 'true')
      ORDER BY timestamp ASC
    `;
  }
  
  const result = await query;
  return result.rows as Interaction[];
}

/**
 * Get excluded interactions for a deal
 */
export async function getExcludedInteractionsForDeal(dealId: string): Promise<Interaction[]> {
  const result = await sql`
    SELECT * FROM interactions 
    WHERE deal_id = ${dealId}
    AND metadata->>'excluded' = 'true'
    ORDER BY timestamp ASC
  `;
  
  return result.rows as Interaction[];
}

/**
 * Exclude an interaction from future analyses
 */
export async function excludeInteraction(interactionId: string): Promise<void> {
  await sql`
    UPDATE interactions 
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{excluded}',
      'true'
    )
    WHERE id = ${interactionId}
  `;
}

/**
 * Include a previously excluded interaction
 */
export async function includeInteraction(interactionId: string): Promise<void> {
  await sql`
    UPDATE interactions 
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{excluded}',
      'false'
    )
    WHERE id = ${interactionId}
  `;
}

/**
 * Exclude a manual email from future analyses
 */
export async function excludeManualEmail(emailId: string): Promise<void> {
  await sql`
    UPDATE manual_emails
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{excluded}',
      'true'
    )
    WHERE id = ${emailId}
  `;
}

/**
 * Include a previously excluded manual email
 */
export async function includeManualEmail(emailId: string): Promise<void> {
  await sql`
    UPDATE manual_emails
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{excluded}',
      'false'
    )
    WHERE id = ${emailId}
  `;
}

/**
 * Get excluded manual emails for a deal
 */
export async function getExcludedManualEmailsForDeal(dealId: string): Promise<ManualEmail[]> {
  const result = await sql`
    SELECT * FROM manual_emails
    WHERE deal_id = ${dealId}
    AND metadata->>'excluded' = 'true'
    ORDER BY timestamp ASC
  `;
  
  return result.rows as ManualEmail[];
}

/**
 * Get all manual emails for a deal
 * By default, excludes flagged emails
 */
export async function getManualEmailsForDeal(dealId: string, includeExcluded: boolean = false): Promise<ManualEmail[]> {
  let query;
  
  if (includeExcluded) {
    query = sql`
      SELECT * FROM manual_emails
      WHERE deal_id = ${dealId}
      ORDER BY timestamp ASC
    `;
  } else {
    query = sql`
      SELECT * FROM manual_emails
      WHERE deal_id = ${dealId}
      AND (metadata->>'excluded' IS NULL OR metadata->>'excluded' != 'true')
      ORDER BY timestamp ASC
    `;
  }
  
  const result = await query;
  return result.rows as ManualEmail[];
}

/**
 * Create manual email record
 */
export async function createManualEmail(
  dealId: string,
  data: {
    subject: string;
    fromEmail: string;
    toEmail: string;
    timestamp: string;
    blobUrl: string;
    importBatchId?: string;
  }
): Promise<ManualEmail> {
  const result = await sql`
    INSERT INTO manual_emails (
      deal_id, subject, from_email, to_email, timestamp, blob_url, import_batch_id
    )
    VALUES (
      ${dealId}, ${data.subject}, ${data.fromEmail}, ${data.toEmail},
      ${data.timestamp}, ${data.blobUrl}, ${data.importBatchId || null}
    )
    RETURNING *
  `;
  
  return result.rows[0] as ManualEmail;
}

/**
 * Create an analysis record
 */
export async function createAnalysis(
  dealId: string,
  analysisType: 'active_health' | 'closed_lost' | 'closed_won' | 'customer_sentiment',
  data: {
    execSummary: string;
    nextSteps: string;
    details: any;
    slackThreadTs?: string;
    slackChannel?: string;
  }
): Promise<Analysis> {
  const result = await sql`
    INSERT INTO analyses (
      deal_id, analysis_type, exec_summary, next_steps, details,
      slack_thread_ts, slack_channel
    )
    VALUES (
      ${dealId}, ${analysisType}, ${data.execSummary}, ${data.nextSteps},
      ${JSON.stringify(data.details)}, ${data.slackThreadTs || null}, ${data.slackChannel || null}
    )
    RETURNING *
  `;
  
  return result.rows[0] as Analysis;
}

/**
 * Get latest analysis for a deal
 */
export async function getLatestAnalysis(dealId: string): Promise<Analysis | null> {
  const result = await sql`
    SELECT * FROM analyses
    WHERE deal_id = ${dealId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  
  return result.rows[0] as Analysis || null;
}

/**
 * Get all analyses for a deal
 */
export async function getAnalysesForDeal(dealId: string): Promise<Analysis[]> {
  const result = await sql`
    SELECT * FROM analyses
    WHERE deal_id = ${dealId}
    ORDER BY created_at DESC
  `;
  
  return result.rows as Analysis[];
}

/**
 * List all deals with recent activity
 */
export async function listDealsWithActivity(limit: number = 50): Promise<Deal[]> {
  const result = await sql`
    SELECT DISTINCT d.* 
    FROM deals d
    LEFT JOIN interactions i ON d.id = i.deal_id
    ORDER BY d.updated_at DESC
    LIMIT ${limit}
  `;
  
  return result.rows as Deal[];
}

