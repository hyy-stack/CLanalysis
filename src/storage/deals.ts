import { FileStorage } from './index.js';
import type { Deal, Call, Transcript } from '../types/common.js';

/**
 * High-level operations for managing deal data
 */
export class DealRepository {
  constructor(private storage: FileStorage) {}

  /**
   * Save a complete deal with all its calls and transcripts
   */
  async saveDealData(
    deal: Deal,
    calls: Call[],
    transcripts: Transcript[]
  ): Promise<void> {
    // Save the deal
    await this.storage.saveDeal(deal);

    // Save all calls
    for (const call of calls) {
      await this.storage.saveCall(call);
    }

    // Save all transcripts
    for (const transcript of transcripts) {
      await this.storage.saveTranscript(transcript, deal.id);
    }
  }

  /**
   * Get a complete deal with all its data
   */
  async getDealData(dealId: string): Promise<{
    deal: Deal;
    calls: Call[];
    transcripts: Transcript[];
  } | null> {
    const deal = await this.storage.getDeal(dealId);
    if (!deal) {
      return null;
    }

    const calls = await this.storage.listCallsForDeal(dealId);
    const transcripts: Transcript[] = [];

    for (const call of calls) {
      const transcript = await this.storage.getTranscript(dealId, call.id);
      if (transcript) {
        transcripts.push(transcript);
      }
    }

    return { deal, calls, transcripts };
  }

  /**
   * List all deals
   */
  async listDeals(): Promise<Deal[]> {
    return this.storage.listDeals();
  }

  /**
   * Check if a deal exists
   */
  async dealExists(dealId: string): Promise<boolean> {
    const deal = await this.storage.getDeal(dealId);
    return deal !== null;
  }

  /**
   * Get calls for a deal
   */
  async getCallsForDeal(dealId: string): Promise<Call[]> {
    return this.storage.listCallsForDeal(dealId);
  }

  /**
   * Get transcript for a specific call
   */
  async getTranscript(dealId: string, callId: string): Promise<Transcript | null> {
    return this.storage.getTranscript(dealId, callId);
  }
}



