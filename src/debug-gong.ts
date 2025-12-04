#!/usr/bin/env node
/**
 * Debug utility to inspect what data Gong API returns
 */

import { config } from './config/config.js';
import { GongClient } from './datasources/gong/client.js';

async function main() {
  console.log('🔍 Gong API Debug Tool\n');
  
  const client = new GongClient(config.gong.accessKey, config.gong.accessKeySecret);
  
  try {
    // Test connection
    console.log('Testing connection...');
    const connected = await client.testConnection();
    if (!connected) {
      console.error('❌ Connection failed');
      process.exit(1);
    }
    console.log('✅ Connected to Gong\n');
    
    // Get a few recent calls
    console.log('Fetching 5 recent calls...\n');
    const response = await client.listCalls({});
    
    if (!response.calls || response.calls.length === 0) {
      console.log('No calls found');
      return;
    }
    
    // Show first 5 calls with full details
    const callsToShow = response.calls.slice(0, 5);
    
    callsToShow.forEach((call, index) => {
      console.log(`\n━━━ Call #${index + 1} ━━━`);
      console.log(`ID: ${call.id}`);
      console.log(`Title: ${call.title || 'No title'}`);
      console.log(`Date: ${call.started || call.scheduled}`);
      console.log(`Duration: ${call.duration ? Math.floor(call.duration / 60) : 0} minutes`);
      console.log(`URL: ${call.url}`);
      console.log(`\nParties (${call.parties?.length || 0}):`);
      
      if (call.parties && call.parties.length > 0) {
        call.parties.forEach((party, pIndex) => {
          console.log(`  ${pIndex + 1}. ${party.name || 'Unknown'}`);
          console.log(`     Email: ${party.emailAddress || 'N/A'}`);
          console.log(`     Affiliation: ${party.affiliation || 'N/A'}`);
          console.log(`     Context: ${JSON.stringify(party.context || [])}`);
          console.log(`     Speaker ID: ${party.speakerId || 'N/A'}`);
        });
      } else {
        console.log('  (No party information available)');
      }
      
      console.log(`\nRaw call object keys: ${Object.keys(call).join(', ')}`);
    });
    
    // Try to get transcript for first call
    console.log('\n\n━━━ Testing Transcript Fetch ━━━');
    const firstCallId = callsToShow[0].id;
    console.log(`Fetching transcript for call: ${firstCallId}\n`);
    
    try {
      const transcriptResponse = await client.getCallTranscript(firstCallId);
      console.log(`Response keys: ${Object.keys(transcriptResponse).join(', ')}`);
      
      if (transcriptResponse.callTranscripts && transcriptResponse.callTranscripts.length > 0) {
        const transcript = transcriptResponse.callTranscripts[0];
        console.log(`\nTranscript structure:`);
        console.log(`  Call ID: ${transcript.callId}`);
        console.log(`  Has transcript object: ${!!transcript.transcript}`);
        
        if (transcript.transcript) {
          const keys = Object.keys(transcript.transcript);
          console.log(`  Transcript keys (first 10): ${keys.slice(0, 10).join(', ')}`);
          console.log(`  Total keys: ${keys.length}`);
          console.log(`  Is Array: ${Array.isArray(transcript.transcript)}`);
          console.log(`  Has 'sentences' property: ${!!transcript.transcript.sentences}`);
          
          // Try to get first item
          let firstItem = null;
          if (Array.isArray(transcript.transcript)) {
            firstItem = transcript.transcript[0];
          } else if (transcript.transcript.sentences) {
            firstItem = transcript.transcript.sentences[0];
          } else if (transcript.transcript[0]) {
            firstItem = transcript.transcript[0];
          }
          
          if (firstItem) {
            console.log(`\n  First item structure:`);
            console.log(`    Keys: ${Object.keys(firstItem).join(', ')}`);
            console.log(`    Speaker ID: ${firstItem.speakerId || 'N/A'}`);
            console.log(`    Start: ${firstItem.start || 'N/A'}`);
            console.log(`    End: ${firstItem.end || 'N/A'}`);
            console.log(`    Text preview: ${firstItem.text?.substring(0, 100) || 'N/A'}...`);
          }
        }
      } else {
        console.log('No transcript data in response');
      }
    } catch (error) {
      console.error('Transcript fetch error:', (error as Error).message);
    }
    
    console.log('\n\n━━━ Summary ━━━');
    console.log(`Total calls available: ${response.calls.length}`);
    console.log(`Parties data available: ${response.calls.filter(c => c.parties && c.parties.length > 0).length} calls`);
    console.log(`\nTo filter by account, we need to identify which field contains the account/company ID.`);
    console.log(`Check the "Context" field in parties, or other fields in the raw call object.`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

