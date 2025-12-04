import type { Deal, Call, Transcript, DealFilter } from '../types/common.js';

/**
 * Abstract interface for data sources
 * Implement this interface to add new data sources (e.g., Salesforce, HubSpot)
 */
export interface DataSource {
  /**
   * Unique identifier for this data source
   */
  readonly name: string;

  /**
   * Sync deals matching the filter criteria
   * @param filter - Criteria to filter deals
   * @returns Array of deals matching the filter
   */
  syncDeals(filter: DealFilter): Promise<Deal[]>;

  /**
   * Sync all calls associated with a specific deal
   * @param dealId - The deal identifier
   * @returns Array of calls for the deal
   */
  syncCallsForDeal(dealId: string): Promise<Call[]>;

  /**
   * Get the transcript for a specific call
   * @param callId - The call identifier
   * @returns Transcript with all conversation turns
   */
  getTranscript(callId: string): Promise<Transcript>;

  /**
   * Test the connection to the data source
   * @returns true if connection is successful
   */
  testConnection(): Promise<boolean>;
}

/**
 * Base class with common functionality for data sources
 */
export abstract class BaseDataSource implements DataSource {
  abstract readonly name: string;
  abstract syncDeals(filter: DealFilter): Promise<Deal[]>;
  abstract syncCallsForDeal(dealId: string): Promise<Call[]>;
  abstract getTranscript(callId: string): Promise<Transcript>;
  abstract testConnection(): Promise<boolean>;

  /**
   * Log a message with the data source name prefix
   */
  protected log(message: string, ...args: unknown[]): void {
    console.log(`[${this.name}] ${message}`, ...args);
  }

  /**
   * Log an error with the data source name prefix
   */
  protected logError(message: string, error?: unknown): void {
    console.error(`[${this.name}] ERROR: ${message}`, error);
  }
}



