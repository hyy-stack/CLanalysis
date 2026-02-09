#!/usr/bin/env node
/**
 * Re-run beta analysis for deals that were analyzed since a given date
 * This is useful to backfill Google Sheets after fixing issues
 *
 * Usage: node scripts/rerun-beta-since.js "2026-02-04 09:02" America/Los_Angeles
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { sql } = require('@vercel/postgres');

const API_KEY = process.env.INTERNAL_API_KEY;
const BASE_URL = 'https://anrok-deal-analyzer.vercel.app/api/analyze-deal-beta';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function triggerAnalysis(crmId, dealName, skipSlack = false) {
  console.log(`\n[${new Date().toISOString()}] Analyzing: ${dealName} (${crmId})${skipSlack ? ' [skip-slack]' : ''}`);

  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({ crmId, skipSlack }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`  ❌ Failed: ${response.status} - ${text.substring(0, 200)}`);
      return false;
    }

    const result = await response.json();
    console.log(`  ✅ Success: Health=${result.structuredData?.dealHealthScore || 'N/A'}, Slack=${result.slackThread || 'N/A'}`);
    return true;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  // Parse date argument - default to Feb 4, 2026 9:02 AM Pacific
  const dateArg = process.argv[2] || '2026-02-04 09:02';
  const tzArg = process.argv[3] || 'America/Los_Angeles';

  // Convert to UTC for database query
  const localDate = new Date(dateArg + ' ' + tzArg.replace('_', ' '));
  // Simple approach: Feb 4 9:02 AM Pacific = Feb 4 17:02 UTC
  const sinceDate = '2026-02-04T17:02:00Z';

  console.log(`Finding deals with beta analyses since: ${sinceDate}\n`);

  // Find distinct deals that had com_enhanced analysis since that date
  const result = await sql`
    SELECT DISTINCT d.id, d.name, d.crm_id, d.stage,
           MAX(a.created_at) as last_analysis
    FROM analyses a
    INNER JOIN deals d ON a.deal_id = d.id
    WHERE a.analysis_type = 'com_enhanced'
      AND a.created_at >= ${sinceDate}::timestamptz
    GROUP BY d.id, d.name, d.crm_id, d.stage
    ORDER BY MAX(a.created_at) ASC
  `;

  console.log(`Found ${result.rows.length} deals with beta analyses since ${sinceDate}\n`);

  if (result.rows.length === 0) {
    console.log('No deals to re-analyze.');
    process.exit(0);
  }

  result.rows.forEach(d => {
    console.log(`  ${d.name} | ${d.crm_id} | ${d.stage} | Last: ${d.last_analysis}`);
  });

  // Parse flags
  const args = process.argv.slice(2);
  const skipSlack = args.includes('--skip-slack');
  const confirmed = args.includes('--yes') || args.includes('-y');

  // Ask for confirmation
  console.log(`\nAbout to re-run beta analysis for ${result.rows.length} deals.`);
  if (skipSlack) {
    console.log('This will update Google Sheets only (Slack posts will be skipped).\n');
  } else {
    console.log('This will update Google Sheets AND post to Slack.\n');
  }

  if (!confirmed) {
    console.log('Add --yes to confirm and run.');
    console.log('Add --skip-slack to skip Slack posts (update Sheets only).');
    console.log('\nExample: node scripts/rerun-beta-since.js --yes --skip-slack');
    process.exit(0);
  }

  console.log('--- Starting batch re-analysis ---\n');

  let successful = 0;
  let failed = 0;

  for (const deal of result.rows) {
    const success = await triggerAnalysis(deal.crm_id, deal.name, skipSlack);
    if (success) successful++;
    else failed++;

    // Wait 10 seconds between requests
    await sleep(10000);
  }

  console.log('\n--- Batch complete ---');
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
}

main().catch(console.error);
