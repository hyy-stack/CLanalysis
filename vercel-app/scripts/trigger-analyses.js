/**
 * Script to manually trigger analysis for deals that should have been analyzed
 * Usage: node scripts/trigger-analyses.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { sql } = require('@vercel/postgres');

const DEAL_NAMES = [
  'Digits',
  'Applause',
  'Vispa',
  'genlogs',
  'The Lifetime Value Co. LLC.',
  'Clicktech Solutions Limited',
  'Consero Global',
];

async function findDealsByName(names) {
  // Query deals matching any of the names using IN clause
  // Build the query with proper parameterization
  const result = await sql`
    SELECT id, name, crm_id, stage 
    FROM deals 
    WHERE name = ANY(${names})
    ORDER BY updated_at DESC
  `;
  
  return result.rows;
}

async function triggerAnalysis(dealId, dealName) {
  const url = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}/api/analyze-deal`
    : 'https://anrok-deal-analyzer.vercel.app/api/analyze-deal';
  
  console.log(`\n[Trigger] Analyzing ${dealName} (${dealId})...`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Call': 'internal',
      },
      body: JSON.stringify({ dealId }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Trigger] ❌ Failed for ${dealName}: ${response.status} - ${errorText}`);
      return false;
    }
    
    const result = await response.json();
    console.log(`[Trigger] ✅ Success for ${dealName}:`, {
      analysisId: result.analysisId,
      slackThread: result.slackThread,
      interactions: result.summary?.interactions,
      emails: result.summary?.emails,
    });
    return true;
  } catch (error) {
    console.error(`[Trigger] ❌ Error for ${dealName}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('Finding deals...');
  const deals = await findDealsByName(DEAL_NAMES);
  
  if (deals.length === 0) {
    console.log('No deals found matching the names');
    return;
  }
  
  console.log(`Found ${deals.length} deal(s):`);
  deals.forEach(d => {
    console.log(`  - ${d.name} (${d.id}) - ${d.stage}`);
  });
  
  console.log('\nTriggering analyses...');
  const results = [];
  
  for (const deal of deals) {
    const success = await triggerAnalysis(deal.id, deal.name);
    results.push({ deal: deal.name, success });
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n=== Summary ===');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed deals:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.deal}`);
    });
  }
}

main().catch(console.error);

