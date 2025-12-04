#!/usr/bin/env node
/**
 * Show the COMPLETE call object from Gong to see what fields are available
 */

import { config } from './config/config.js';
import { GongClient } from './datasources/gong/client.js';

const callId = process.argv[2] || '6288999481412681321';

async function main() {
  console.log(`🔍 Fetching Full Call Data: ${callId}\n`);
  
  const client = new GongClient(config.gong.accessKey, config.gong.accessKeySecret);
  
  try {
    const response = await client.getCall(callId);
    const call = response.call || response;
    
    console.log('━━━ COMPLETE CALL OBJECT ━━━\n');
    console.log(JSON.stringify(call, null, 2));
    
    console.log('\n━━━ KEY FIELDS TO LOOK FOR ━━━\n');
    
    // Look for company/account identifiers
    const potentialCompanyFields = [
      'primaryCompanyId',
      'companyId', 
      'accountId',
      'clientUniqueId',
      'customData',
      'parties',
      'workspaceId'
    ];
    
    console.log('Checking for company identifiers:\n');
    potentialCompanyFields.forEach(field => {
      if (call[field]) {
        console.log(`✓ ${field}:`, JSON.stringify(call[field]));
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();



