#!/usr/bin/env node
/**
 * Inspect a specific call to understand its structure
 */

import { config } from './config/config.js';
import { GongClient } from './datasources/gong/client.js';

const callId = process.argv[2];

if (!callId) {
  console.error('Usage: npm run inspect-call <call-id>');
  process.exit(1);
}

async function main() {
  console.log(`🔍 Inspecting Call: ${callId}\n`);
  
  const client = new GongClient(config.gong.accessKey, config.gong.accessKeySecret);
  
  try {
    // First, get the call using the basic GET endpoint
    console.log('Fetching call from recent calls...\n');
    const listResponse = await (client as any).listCalls({});
    
    // Find our specific call
    const call = listResponse.calls?.find((c: any) => c.id === callId);
    
    if (!call) {
      console.log('❌ Call not found in recent calls');
      console.log('Note: The call might be older than what the API returns by default');
      console.log('Try getting a more recent call ID from Gong');
      return;
    }
    
    console.log('━━━ CALL DETAILS ━━━\n');
    console.log(`ID: ${call.id}`);
    console.log(`Title: ${call.title || 'No title'}`);
    console.log(`Date: ${call.started || call.scheduled}`);
    console.log(`Duration: ${call.duration ? Math.floor(call.duration / 60) : 0} minutes`);
    console.log(`URL: ${call.url}`);
    
    console.log('\n━━━ ALL FIELDS ━━━\n');
    console.log(JSON.stringify(call, null, 2));
    
    console.log('\n━━━ PARTIES ━━━\n');
    if (call.parties && call.parties.length > 0) {
      call.parties.forEach((party: any, index: number) => {
        console.log(`Party ${index + 1}:`);
        console.log(`  Name: ${party.name || 'Unknown'}`);
        console.log(`  Email: ${party.emailAddress || 'N/A'}`);
        console.log(`  Affiliation: ${party.affiliation || 'N/A'}`);
        console.log(`  User ID: ${party.userId || 'N/A'}`);
        console.log(`  Speaker ID: ${party.speakerId || 'N/A'}`);
        console.log(`  Context: ${JSON.stringify(party.context || [])}`);
        console.log(`  Methods: ${JSON.stringify(party.methods || [])}`);
        console.log('');
      });
    } else {
      console.log('No party information available');
    }
    
    console.log('\n━━━ COMPANY/ACCOUNT INFORMATION ━━━\n');
    console.log('Looking for company/account identifiers...\n');
    
    // Check various fields that might contain company info
    if (call.clientUniqueId) console.log(`Client Unique ID: ${call.clientUniqueId}`);
    if (call.customData) console.log(`Custom Data: ${JSON.stringify(call.customData)}`);
    if (call.purpose) console.log(`Purpose: ${call.purpose}`);
    
    // Look in parties for company context
    if (call.parties) {
      const externalParties = call.parties.filter((p: any) => p.affiliation === 'external');
      if (externalParties.length > 0) {
        console.log('\nExternal Parties (Customers):');
        externalParties.forEach((p: any) => {
          if (p.context && p.context.length > 0) {
            console.log(`  - ${p.name}: Company context = ${p.context[0]}`);
          }
        });
      }
    }
    
    console.log('\n━━━ NEXT STEPS ━━━\n');
    console.log('To find all calls for this company, we need to identify the right filter.');
    console.log('Check the fields above for company identifiers (CRM IDs, company names, etc.)');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

