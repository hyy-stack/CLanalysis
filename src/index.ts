#!/usr/bin/env node

import { Command } from 'commander';
import { config, paths } from './config/config.js';
import { GongDataSource } from './datasources/gong/datasource.js';
import { FileStorage } from './storage/index.js';
import { DealRepository } from './storage/deals.js';
import { AnalysisEngine } from './analysis/engine.js';
import type { Deal } from './types/common.js';

const program = new Command();

program
  .name('anrok-closedlost-bot')
  .description('Analyze closed/lost deals using Gong data')
  .version('1.0.0');

/**
 * Sync command - Fetch data from Gong
 */
program
  .command('sync')
  .description('Sync deal and call data from Gong')
  .option('-d, --deal-id <id>', 'Sync a specific deal by ID')
  .option('-a, --account-id <id>', 'Sync calls for a specific account/company ID')
  .option('-c, --company-name <name>', 'Filter calls by company name in title')
  .option('--call-ids <ids>', 'Sync specific calls by IDs (comma-separated)')
  .option('--deal-name <name>', 'Override deal name (useful for single call analysis)')
  .option('-f, --from-date <date>', 'Start date for calls (YYYY-MM-DD)', '')
  .option('-t, --to-date <date>', 'End date for calls (YYYY-MM-DD)', '')
  .option('-l, --limit <number>', 'Limit number of calls to sync', '50')
  .action(async (options) => {
    try {
      console.log('🔄 Starting sync from Gong...\n');

      // Initialize storage
      const storage = new FileStorage(
        paths.data,
        paths.deals,
        paths.analysis,
        paths.syncMetadata
      );
      await storage.initialize();
      console.log('✓ Storage initialized');

      // Initialize Gong data source
      const gongDataSource = new GongDataSource(
        config.gong.accessKey,
        config.gong.accessKeySecret
      );

      // Test connection
      console.log('🔌 Testing Gong connection...');
      const connected = await gongDataSource.testConnection();
      if (!connected) {
        console.error('❌ Failed to connect to Gong. Please check your credentials.');
        process.exit(1);
      }
      console.log('✓ Connected to Gong\n');

      const dealRepo = new DealRepository(storage);

      if (options.dealId) {
        // Sync specific deal
        await syncDeal(gongDataSource, dealRepo, options.dealId, 'deal');
      } else if (options.accountId) {
        // Sync by account ID
        await syncDeal(gongDataSource, dealRepo, options.accountId, 'account');
      } else if (options.companyName) {
        // Sync by company name (filter call titles)
        await syncByCompanyName(gongDataSource, dealRepo, options.companyName, options.fromDate, options.toDate);
      } else if (options.callIds) {
        // Sync specific calls by IDs
        const callIds = options.callIds.split(',').map((id: string) => id.trim());
        await syncByCallIds(gongDataSource, dealRepo, callIds, options.dealName);
      } else {
        // For MVP, we need either a deal ID, account ID, or company name
        console.log('⚠️  Note: Please provide one of the following:\n');
        console.log('Examples:');
        console.log('  npm run sync -- --deal-id YOUR_DEAL_ID');
        console.log('  npm run sync -- --account-id YOUR_ACCOUNT_ID');
        console.log('  npm run sync -- --company-name "Acme Corp"\n');
        console.log('💡 Recommended: Use --company-name to filter by company');
        console.log('   This filters calls where the title contains the company name.\n');
        process.exit(0);
      }

      // Update sync metadata
      await storage.saveSyncMetadata({
        lastSyncDate: new Date().toISOString(),
        dealsSynced: 1,
        callsSynced: 0,
        transcriptsSynced: 0,
      });

      console.log('\n✅ Sync completed successfully!');
    } catch (error) {
      console.error('❌ Sync failed:', error);
      process.exit(1);
    }
  });

/**
 * Analyze command - Run analysis on synced data
 */
program
  .command('analyze')
  .description('Analyze synced deals to understand why they were lost')
  .option('-d, --deal-id <id>', 'Analyze a specific deal by ID')
  .option('-a, --all', 'Analyze all synced deals')
  .action(async (options) => {
    try {
      console.log('🔍 Starting analysis...\n');

      // Initialize storage
      const storage = new FileStorage(
        paths.data,
        paths.deals,
        paths.analysis,
        paths.syncMetadata
      );
      await storage.initialize();

      const dealRepo = new DealRepository(storage);
      const analysisEngine = new AnalysisEngine(paths.prompts, paths.analysis);

      if (options.dealId) {
        // Analyze specific deal
        await analyzeDeal(dealRepo, analysisEngine, options.dealId);
      } else if (options.all) {
        // Analyze all deals
        const deals = await dealRepo.listDeals();
        
        if (deals.length === 0) {
          console.log('⚠️  No deals found. Please run sync first.');
          process.exit(0);
        }

        console.log(`Found ${deals.length} deal(s) to analyze\n`);

        for (const deal of deals) {
          await analyzeDeal(dealRepo, analysisEngine, deal.id);
          console.log('---\n');
        }
      } else {
        console.log('⚠️  Please specify either --deal-id or --all');
        console.log('Examples:');
        console.log('  npm run analyze -- --deal-id YOUR_DEAL_ID');
        console.log('  npm run analyze -- --all');
        process.exit(0);
      }

      console.log('\n✅ Analysis completed successfully!');
      console.log(`\n📁 Analysis files saved to: ${paths.analysis}`);
      console.log('\n📝 Next steps:');
      console.log('1. Open the generated prompt files in your IDE');
      console.log('2. Copy and paste them into your preferred LLM (GPT-4, Claude, etc.)');
      console.log('3. Review the insights to understand why deals were lost');
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    }
  });

/**
 * Status command - Show sync status and available deals
 */
program
  .command('status')
  .description('Show sync status and list available deals')
  .action(async () => {
    try {
      const storage = new FileStorage(
        paths.data,
        paths.deals,
        paths.analysis,
        paths.syncMetadata
      );
      await storage.initialize();

      const dealRepo = new DealRepository(storage);

      // Get sync metadata
      const syncMetadata = await storage.getSyncMetadata();
      
      console.log('📊 Sync Status\n');
      if (syncMetadata) {
        console.log(`Last Sync: ${new Date(syncMetadata.lastSyncDate).toLocaleString()}`);
        console.log(`Deals Synced: ${syncMetadata.dealsSynced}`);
        console.log(`Calls Synced: ${syncMetadata.callsSynced}`);
        console.log(`Transcripts Synced: ${syncMetadata.transcriptsSynced}`);
      } else {
        console.log('No sync performed yet. Run `npm run sync` to get started.');
      }

      // List available deals
      const deals = await dealRepo.listDeals();
      
      console.log(`\n📋 Available Deals (${deals.length})\n`);
      
      if (deals.length === 0) {
        console.log('No deals found. Run sync to fetch data from Gong.');
      } else {
        for (const deal of deals) {
          const calls = await dealRepo.getCallsForDeal(deal.id);
          console.log(`• ${deal.name} (${deal.id})`);
          console.log(`  Stage: ${deal.stage} | Calls: ${calls.length}`);
          console.log(`  Value: ${deal.value ? `${deal.currency || '$'}${deal.value.toLocaleString()}` : 'N/A'}`);
          console.log('');
        }
      }

      console.log(`\n📁 Data Directory: ${paths.data}`);
      console.log(`📁 Analysis Directory: ${paths.analysis}`);
    } catch (error) {
      console.error('❌ Failed to get status:', error);
      process.exit(1);
    }
  });

/**
 * Helper: Sync calls filtered by company name
 */
async function syncByCompanyName(
  dataSource: GongDataSource,
  dealRepo: DealRepository,
  companyName: string,
  fromDate?: string,
  toDate?: string
): Promise<void> {
  console.log(`📦 Syncing calls for company: "${companyName}"\n`);

  // Create a safe ID from the company name
  const companyId = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Determine date range
  let fromDateTime: string;
  let toDateTime: string | undefined;
  
  if (fromDate) {
    fromDateTime = new Date(fromDate).toISOString();
    console.log(`Searching from: ${fromDate}`);
  } else {
    // Default: last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    fromDateTime = ninetyDaysAgo.toISOString();
    console.log('Searching last 90 days');
  }
  
  if (toDate) {
    toDateTime = new Date(toDate).toISOString();
    console.log(`Searching to: ${toDate}`);
  }
  
  console.log('Fetching calls from Gong...');
  
  try {
    // Fetch calls with pagination support
    let allCalls: any[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    const maxPages = 10; // Limit to 10 pages (1000 calls) for now
    
    do {
      const response = await (dataSource as any).client.listCalls({
        fromDateTime,
        toDateTime,
        cursor,
      });

      if (!response.calls || response.calls.length === 0) {
        break;
      }

      allCalls = allCalls.concat(response.calls);
      cursor = response.records?.cursor;
      pageCount++;
      
      console.log(`  Page ${pageCount}: ${response.calls.length} calls (total so far: ${allCalls.length})`);
      
      // Stop if we've found calls with our company name (optimization)
      const matchingSoFar = allCalls.filter((call: any) => {
        const title = (call.title || '').toLowerCase();
        return title.includes(companyName.toLowerCase());
      });
      
      if (matchingSoFar.length > 0 && pageCount >= 3) {
        console.log(`  Found ${matchingSoFar.length} matching calls, stopping pagination`);
        break;
      }
      
    } while (cursor && pageCount < maxPages);

    if (allCalls.length === 0) {
      console.log('❌ No calls found');
      return;
    }
    
    console.log(`✓ Fetched ${allCalls.length} total calls across ${pageCount} page(s)\n`);
    
    const allCallsResponse = { calls: allCalls };

    // Show first few titles for debugging
    console.log('\nSample call titles:');
    allCallsResponse.calls.slice(0, 5).forEach((call: any, i: number) => {
      console.log(`  ${i + 1}. "${call.title || '(no title)'}"`);
    });
    console.log('');

    // Filter by company name in title (case-insensitive)
    const matchingCalls = allCallsResponse.calls.filter((call: any) => {
      const title = (call.title || '').toLowerCase();
      return title.includes(companyName.toLowerCase());
    });

    console.log(`✓ Filtered to ${matchingCalls.length} calls matching "${companyName}"\n`);

    if (matchingCalls.length === 0) {
      console.log(`⚠️  No calls found with "${companyName}" in the title`);
      console.log('\nTip: Try a shorter or different variation of the company name');
      return;
    }

    // Show matching calls
    console.log('Matching calls:');
    matchingCalls.slice(0, 10).forEach((call: any, i: number) => {
      console.log(`  ${i + 1}. ${call.title} (${new Date(call.started || call.scheduled).toLocaleDateString()})`);
    });
    if (matchingCalls.length > 10) {
      console.log(`  ... and ${matchingCalls.length - 10} more`);
    }
    console.log('');

    // Create a deal placeholder for this company
    const deal: Deal = {
      id: companyId,
      name: companyName,
      stage: 'closed_lost',
      participants: [],
      metadata: {
        source: 'gong',
        filterMethod: 'company-name',
        syncedAt: new Date().toISOString(),
      },
    };

    // Map calls to our format
    const calls = matchingCalls.map((gongCall: any) => (dataSource as any).mapGongCallToCall(gongCall, companyId));

    // Fetch transcripts
    console.log('Fetching transcripts...');
    const transcripts = [];
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      try {
        console.log(`  [${i + 1}/${calls.length}] Fetching transcript for call ${call.id}...`);
        // Pass the call date to help Gong filter
        const transcript = await dataSource.getTranscript(call.id, call.date);
        
        // Enrich with speaker roles
        const enrichedTranscript = await dataSource.enrichTranscriptWithRoles(transcript, call);
        transcripts.push(enrichedTranscript);
        console.log(`  ✓ Transcript retrieved (${enrichedTranscript.turns.length} turns)`);
      } catch (error) {
        console.log(`  ⚠️  Failed to fetch transcript: ${(error as Error).message}`);
      }
    }

    console.log(`\n✓ Retrieved ${transcripts.length} transcript(s)`);

    // Save everything
    console.log('\nSaving data...');
    await dealRepo.saveDealData(deal, calls, transcripts);
    console.log('✓ Data saved successfully');

    console.log(`\n✅ Company "${companyName}" synced successfully!`);
    console.log(`   Calls: ${calls.length}`);
    console.log(`   Transcripts: ${transcripts.length}`);
    console.log(`\n💡 Next: Run analysis with --deal-id ${companyId}`);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

/**
 * Helper: Sync multiple calls by IDs
 */
async function syncByCallIds(
  dataSource: GongDataSource,
  dealRepo: DealRepository,
  callIds: string[],
  dealNameOverride?: string
): Promise<void> {
  console.log(`📦 Syncing ${callIds.length} specific call(s)\n`);

  try {
    const gongCalls = [];
    
    // Fetch each call
    for (const callId of callIds) {
      console.log(`Fetching call ${callId}...`);
      try {
        const response = await (dataSource as any).client.getCall(callId);
        const call = response.call || response;
        
        if (call && call.id) {
          gongCalls.push(call);
          console.log(`  ✓ "${call.title}"`);
        }
      } catch (error: any) {
        console.log(`  ⚠️ Failed to fetch: ${error.message}`);
      }
    }
    
    if (gongCalls.length === 0) {
      console.log('\n❌ No calls could be fetched');
      return;
    }
    
    // Use override name if provided, otherwise extract from title
    let companyName: string;
    let companyId: string;
    
    if (dealNameOverride) {
      companyName = dealNameOverride;
      companyId = dealNameOverride.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    } else {
      // Extract company name from first call title
      const firstTitle = gongCalls[0].title || '';
      companyName = firstTitle.split(/[/|<>]/).map((s: string) => s.trim()).find((s: string) => 
        s && s.toLowerCase() !== 'anrok' && !s.includes('call') && !s.includes('intro')
      ) || 'multi-call-sync';
      companyId = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
    
    console.log(`\n✓ Found ${gongCalls.length} call(s) for: ${companyName}`);
    console.log(`Using deal ID: ${companyId}\n`);
    
    // Create deal
    const deal: Deal = {
      id: companyId,
      name: companyName,
      stage: 'in_progress', // Assume active unless specified
      participants: [],
      metadata: {
        source: 'gong',
        filterMethod: 'call-ids',
        callIds: callIds,
        syncedAt: new Date().toISOString(),
      },
    };
    
    // Map calls
    const calls = gongCalls.map((gongCall: any) => (dataSource as any).mapGongCallToCall(gongCall, companyId));
    
    // Sort by date
    calls.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Fetch transcripts
    console.log('Fetching transcripts...');
    const transcripts = [];
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      try {
        console.log(`  [${i + 1}/${calls.length}] ${call.title}...`);
        const transcript = await dataSource.getTranscript(call.id, call.date);
        const enrichedTranscript = await dataSource.enrichTranscriptWithRoles(transcript, call);
        transcripts.push(enrichedTranscript);
        console.log(`    ✓ ${enrichedTranscript.turns.length} turns`);
      } catch (error) {
        console.log(`    ⚠️ Failed: ${(error as Error).message}`);
      }
    }
    
    console.log(`\n✓ Retrieved ${transcripts.length} transcript(s)`);
    
    // Save
    console.log('\nSaving data...');
    await dealRepo.saveDealData(deal, calls, transcripts);
    console.log('✓ Data saved successfully');
    
    console.log(`\n✅ ${companyName} synced successfully!`);
    console.log(`   Calls: ${calls.length}`);
    console.log(`   Transcripts: ${transcripts.length}`);
    console.log(`\n💡 Next: Run analysis with --deal-id ${companyId}`);
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

/**
 * Helper: Sync a specific call by ID
 */
async function syncByCallId(
  dataSource: GongDataSource,
  dealRepo: DealRepository,
  callId: string
): Promise<void> {
  console.log(`📦 Syncing specific call: ${callId}\n`);

  try {
    // Try to fetch the call directly by ID
    console.log('Fetching call by ID...');
    let response;
    try {
      response = await (dataSource as any).client.getCall(callId);
    } catch (error: any) {
      console.log('❌ Failed to fetch call:', error.message);
      console.log('\nThis could mean:');
      console.log('  - The call is in a different Gong workspace');
      console.log('  - Your API key doesn\'t have access to this call');
      console.log('  - The call ID is incorrect');
      return;
    }
    
    // Gong returns the call nested inside a "call" property
    const gongCall = response.call || response;
    
    if (!gongCall || !gongCall.id) {
      console.log('❌ Call data invalid or empty');
      return;
    }
    
    console.log(`✅ Found call: "${gongCall.title}"`);
    console.log(`Date: ${new Date(gongCall.started || gongCall.scheduled).toLocaleDateString()}`);
    console.log(`Duration: ${gongCall.duration ? Math.floor(gongCall.duration / 60) : 0} minutes\n`);
    
    // Extract company name from title for the deal ID
    const companyName = (gongCall.title || 'unknown').split(/[/|<>]/).map((s: string) => s.trim()).find((s: string) => 
      s && s.toLowerCase() !== 'anrok' && !s.includes('call') && !s.includes('intro')
    ) || 'unknown-company';
    
    const companyId = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    console.log(`Using company ID: ${companyId}\n`);
    
    // Create deal
    const deal: Deal = {
      id: companyId,
      name: companyName,
      stage: 'in_progress',
      participants: [],
      metadata: {
        source: 'gong',
        filterMethod: 'call-id',
        syncedAt: new Date().toISOString(),
      },
    };
    
    // Map the call
    const call = (dataSource as any).mapGongCallToCall(gongCall, companyId);
    
    // Fetch transcript
    console.log('Fetching transcript...');
    const transcript = await dataSource.getTranscript(callId, call.date);
    const enrichedTranscript = await dataSource.enrichTranscriptWithRoles(transcript, call);
    console.log(`✓ Transcript retrieved (${enrichedTranscript.turns.length} turns)\n`);
    
    // Save
    console.log('Saving data...');
    await dealRepo.saveDealData(deal, [call], [enrichedTranscript]);
    console.log('✓ Data saved successfully');
    
    console.log(`\n✅ Call synced successfully!`);
    console.log(`💡 Next: Run analysis with --deal-id ${companyId}`);
    console.log(`💡 Or: Sync all calls for this company with --company-name "${companyName}"`);
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

/**
 * Helper: Sync a specific deal or account
 */
async function syncDeal(
  dataSource: GongDataSource,
  dealRepo: DealRepository,
  id: string,
  type: 'deal' | 'account' = 'deal'
): Promise<void> {
  const label = type === 'account' ? 'account' : 'deal';
  console.log(`📦 Syncing ${label}: ${id}\n`);

  // For MVP, we'll create a placeholder deal and fetch calls
  // In production, this would fetch the deal from Gong's CRM integration
  const deal: Deal = {
    id: id,
    name: type === 'account' ? `Account ${id}` : `Deal ${id}`,
    stage: 'closed_lost', // Assumed for MVP
    participants: [],
    metadata: {
      source: 'gong',
      type: type,
      syncedAt: new Date().toISOString(),
    },
  };

  console.log(`Fetching calls for ${label}...`);
  const calls = await dataSource.syncCallsForDeal(id);
  console.log(`✓ Found ${calls.length} call(s)`);

  console.log('\nFetching transcripts...');
  const transcripts = [];
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    try {
      console.log(`  [${i + 1}/${calls.length}] Fetching transcript for call ${call.id}...`);
      // Pass the call date to help Gong filter
      const transcript = await dataSource.getTranscript(call.id, call.date);
      
      // Enrich transcript with speaker roles
      const enrichedTranscript = await dataSource.enrichTranscriptWithRoles(transcript, call);
      transcripts.push(enrichedTranscript);
      console.log(`  ✓ Transcript retrieved (${enrichedTranscript.turns.length} turns)`);
    } catch (error) {
      console.log(`  ⚠️  Failed to fetch transcript for call ${call.id}: ${(error as Error).message}`);
    }
  }

  console.log(`\n✓ Retrieved ${transcripts.length} transcript(s)`);

  // Save everything
  console.log('\nSaving data...');
  await dealRepo.saveDealData(deal, calls, transcripts);
  console.log('✓ Data saved successfully');

  console.log(`\n✅ ${label.charAt(0).toUpperCase() + label.slice(1)} ${id} synced successfully!`);
  console.log(`   Calls: ${calls.length}`);
  console.log(`   Transcripts: ${transcripts.length}`);
}

/**
 * Helper: Analyze a specific deal
 */
async function analyzeDeal(
  dealRepo: DealRepository,
  analysisEngine: AnalysisEngine,
  dealId: string
): Promise<void> {
  console.log(`🔍 Analyzing deal: ${dealId}\n`);

  const dealData = await dealRepo.getDealData(dealId);
  
  if (!dealData) {
    console.error(`❌ Deal ${dealId} not found. Please sync it first.`);
    return;
  }

  const { deal, calls, transcripts } = dealData;

  console.log(`Deal: ${deal.name}`);
  console.log(`Calls: ${calls.length}`);
  console.log(`Transcripts: ${transcripts.length}\n`);

  if (calls.length === 0) {
    console.log('⚠️  No calls found for this deal. Cannot perform analysis.');
    return;
  }

  if (transcripts.length === 0) {
    console.log('⚠️  No transcripts found. Analysis will be limited.');
  }

  // Run both analyses
  const { dealAnalysisPrompt, sentimentPrompt } = await analysisEngine.analyzeAll(
    deal,
    calls,
    transcripts
  );

  // Generate summary report
  await analysisEngine.generateSummaryReport(deal, calls);

  const isActiveDeal = deal.stage === 'active' || deal.stage === 'in_progress' || deal.stage === 'open';
  const analysisType = isActiveDeal ? 'Deal Health Analysis' : 'Deal Loss Analysis';

  console.log('\n✅ Analysis complete!');
  console.log(`\n📄 Generated files:`);
  console.log(`   • ${analysisType}: ${dealAnalysisPrompt}`);
  console.log(`   • Customer Sentiment: ${sentimentPrompt}`);
}

// Parse command line arguments
program.parse();

