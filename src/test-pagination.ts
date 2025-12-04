#!/usr/bin/env node
/**
 * Test if Gong API supports pagination
 */

import { config } from './config/config.js';
import { GongClient } from './datasources/gong/client.js';

async function main() {
  console.log('🔍 Testing Gong API Pagination\n');
  
  const client = new GongClient(config.gong.accessKey, config.gong.accessKeySecret);
  
  try {
    // Fetch calls from April to now
    const response = await client.listCalls({
      fromDateTime: new Date('2025-04-01').toISOString(),
    });
    
    console.log('Response keys:', Object.keys(response));
    console.log('\nRecords info:', JSON.stringify(response.records || response.meta || {}, null, 2));
    console.log('\nCalls returned:', response.calls?.length || 0);
    console.log('Has cursor?', !!response.cursor);
    console.log('Cursor value:', response.cursor);
    
    // Check if there's pagination info
    if (response.records) {
      console.log('\n━━━ PAGINATION INFO ━━━');
      console.log(JSON.stringify(response.records, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();



