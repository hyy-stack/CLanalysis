#!/usr/bin/env node
/**
 * Fetch a specific call by ID to inspect its details
 */

import { config } from './config/config.js';
import { GongClient } from './datasources/gong/client.js';

const callId = process.argv[2] || '6288999481412681321';

async function main() {
  console.log(`🔍 Fetching Call: ${callId}\n`);
  
  const client = new GongClient(config.gong.accessKey, config.gong.accessKeySecret);
  
  try {
    // Fetch calls from a wide date range to find this one
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const response = await client.listCalls({
      fromDateTime: oneYearAgo.toISOString(),
    });
    
    const call = response.calls?.find((c: any) => c.id === callId);
    
    if (!call) {
      console.log('❌ Call not found in recent results');
      console.log('The call might be older than 1 year');
      return;
    }
    
    console.log('✅ Call found!\n');
    console.log(`Title: "${call.title}"`);
    console.log(`Date: ${call.started || call.scheduled}`);
    console.log(`Duration: ${call.duration ? Math.floor(call.duration / 60) : 0} minutes`);
    console.log(`\nTo sync all calls for this company, extract the company name from the title.`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();



