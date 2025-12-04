import { BaseDataSource } from '../base.js';
import { GongClient } from './client.js';
import type { Deal, Call, Transcript, DealFilter, Participant, TranscriptTurn } from '../../types/common.js';
import type { GongCall, GongParty, GongSentence } from './types.js';

/**
 * Gong data source implementation
 */
export class GongDataSource extends BaseDataSource {
  readonly name = 'Gong';
  private client: GongClient;

  constructor(accessKey: string, accessKeySecret: string) {
    super();
    this.client = new GongClient(accessKey, accessKeySecret);
  }

  async testConnection(): Promise<boolean> {
    this.log('Testing connection...');
    const success = await this.client.testConnection();
    if (success) {
      this.log('Connection successful');
    } else {
      this.logError('Connection failed');
    }
    return success;
  }

  async syncDeals(filter: DealFilter): Promise<Deal[]> {
    this.log('Syncing deals with filter:', filter);
    
    // Note: Gong doesn't have a direct "deals" endpoint unless CRM integration is enabled
    // For MVP, we'll work with calls and infer deal information from call metadata
    // In production, you'd use the CRM integration endpoints
    
    // For now, return empty array with a warning
    this.log('Warning: Deal sync requires Gong CRM integration to be configured');
    this.log('For MVP, we will associate calls with deals manually or via call metadata');
    
    return [];
  }

  async syncCallsForDeal(dealId: string): Promise<Call[]> {
    this.log(`Syncing calls for account: ${dealId}`);
    
    try {
      this.log('Fetching calls using extensive endpoint with companyCrmIds filter...');
      const response = await this.client.listCallsForAccount(dealId);
      
      if (!response.calls || response.calls.length === 0) {
        this.log('No calls found for this account');
        return [];
      }

      // Log what we got back for debugging
      const firstCall = response.calls[0];
      this.log(`✓ Found ${response.calls.length} call(s) for account ${dealId}`);
      this.log(`Sample call - parties: ${firstCall.parties?.length || 0}`);
      
      if (firstCall.parties && firstCall.parties.length > 0) {
        this.log(`First party: ${firstCall.parties[0].name || 'Unknown'} (${firstCall.parties[0].affiliation})`);
      }

      // Map all calls
      const calls = response.calls.map((gongCall: any) => this.mapGongCallToCall(gongCall, dealId));
      
      return calls;
    } catch (error) {
      this.logError(`Failed to sync calls for account ${dealId}`, error);
      throw error;
    }
  }

  async getTranscript(callId: string, callDate?: string): Promise<Transcript> {
    this.log(`Fetching transcript for call: ${callId}`);
    
    try {
      const response = await this.client.getCallTranscript(callId, callDate);
      
      if (!response.callTranscripts || response.callTranscripts.length === 0) {
        this.log(`No transcript data in response for call ${callId}`);
        // Return empty transcript instead of throwing
        return {
          callId,
          turns: [],
          metadata: {},
        };
      }

      const gongTranscript = response.callTranscripts[0];
      
      // Check if transcript has actual content
      // Gong transcript is an array, not an object with sentences property
      if (!gongTranscript.transcript || (Array.isArray(gongTranscript.transcript) && gongTranscript.transcript.length === 0)) {
        this.log(`Transcript exists but has no content for call ${callId}`);
        return {
          callId,
          turns: [],
          metadata: { hasTranscript: false },
        };
      }
      
      const transcript = this.mapGongTranscriptToTranscript(gongTranscript, callId);
      
      this.log(`Retrieved transcript with ${transcript.turns.length} turns`);
      return transcript;
    } catch (error) {
      this.logError(`Failed to fetch transcript for call ${callId}`, error);
      // Return empty transcript instead of throwing
      return {
        callId,
        turns: [],
        metadata: { error: (error as Error).message },
      };
    }
  }

  /**
   * Map Gong call to common Call type
   */
  private mapGongCallToCall(gongCall: GongCall, dealId: string): Call {
    return {
      id: gongCall.id,
      dealId: dealId,
      title: gongCall.title,
      date: gongCall.started || gongCall.scheduled || new Date().toISOString(),
      duration: gongCall.duration || 0,
      participants: (gongCall.parties || []).map(party => this.mapGongPartyToParticipant(party)),
      url: gongCall.url,
      metadata: {
        direction: gongCall.direction,
        system: gongCall.system,
        language: gongCall.language,
        workspaceId: gongCall.workspaceId,
      },
    };
  }

  /**
   * Map Gong party to common Participant type
   */
  private mapGongPartyToParticipant(party: GongParty): Participant {
    // Determine role based on affiliation
    let role: 'customer' | 'sales' | 'other' = 'other';
    if (party.affiliation === 'external') {
      role = 'customer';
    } else if (party.affiliation === 'internal') {
      role = 'sales';
    }

    return {
      id: party.id || party.speakerId || party.emailAddress || 'unknown',
      name: party.name || 'Unknown',
      email: party.emailAddress,
      role,
      company: party.context?.[0], // First context often contains company name
    };
  }

  /**
   * Map Gong transcript to common Transcript type
   * Gong returns transcript as array of topic segments, each with sentences
   */
  private mapGongTranscriptToTranscript(
    gongTranscript: { callId: string; transcript?: any },
    callId: string
  ): Transcript {
    const turns: TranscriptTurn[] = [];
    
    if (!gongTranscript.transcript) {
      return { callId, turns, metadata: { error: 'No transcript data' } };
    }
    
    // Gong transcript is an array of topic segments
    const segments = Array.isArray(gongTranscript.transcript) 
      ? gongTranscript.transcript 
      : Object.values(gongTranscript.transcript);
    
    // Each segment has speakerId and sentences array
    for (const segment of segments) {
      if (!segment || typeof segment !== 'object') continue;
      
      const speakerId = segment.speakerId || 'Unknown';
      const sentences = segment.sentences || [];
      
      // Each sentence within a segment
      for (const sentence of sentences) {
        if (!sentence || typeof sentence !== 'object') continue;
        
        turns.push({
          speaker: speakerId,
          speakerId: speakerId,
          speakerRole: 'other', // We'll match with participants later
          timestamp: sentence.start || 0,
          text: sentence.text || '',
        });
      }
    }

    return {
      callId,
      turns,
      metadata: {
        segmentCount: segments.length,
        turnCount: turns.length,
      },
    };
  }

  /**
   * Enrich transcript turns with speaker roles from call participants
   */
  async enrichTranscriptWithRoles(transcript: Transcript, call: Call): Promise<Transcript> {
    // Create a map of speaker IDs to roles
    const speakerRoles = new Map<string, 'customer' | 'sales' | 'other'>();
    call.participants.forEach(participant => {
      speakerRoles.set(participant.id, participant.role);
    });

    // Update each turn with the correct role
    const enrichedTurns = transcript.turns.map(turn => ({
      ...turn,
      speakerRole: turn.speakerId ? (speakerRoles.get(turn.speakerId) || 'other') : 'other',
    }));

    return {
      ...transcript,
      turns: enrichedTurns,
    };
  }
}

