import fs from 'fs/promises';
import path from 'path';
import type { Deal, Call, Transcript, SyncMetadata } from '../types/common.js';

/**
 * Storage interface for persisting data locally
 */
export interface Storage {
  saveDeal(deal: Deal): Promise<void>;
  getDeal(dealId: string): Promise<Deal | null>;
  listDeals(): Promise<Deal[]>;
  
  saveCall(call: Call): Promise<void>;
  getCall(dealId: string, callId: string): Promise<Call | null>;
  listCallsForDeal(dealId: string): Promise<Call[]>;
  
  saveTranscript(transcript: Transcript, dealId: string): Promise<void>;
  getTranscript(dealId: string, callId: string): Promise<Transcript | null>;
  
  saveSyncMetadata(metadata: SyncMetadata): Promise<void>;
  getSyncMetadata(): Promise<SyncMetadata | null>;
}

/**
 * Ensure directory exists, create if it doesn't
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore error if directory already exists
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Read JSON file with error handling
 */
async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write JSON file with pretty formatting
 */
async function writeJSON(filePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * File-based storage implementation using JSON files
 */
export class FileStorage implements Storage {
  constructor(
    private readonly dataDir: string,
    private readonly dealsDir: string,
    private readonly analysisDir: string,
    private readonly syncMetadataPath: string
  ) {}

  /**
   * Initialize storage directories
   */
  async initialize(): Promise<void> {
    await ensureDir(this.dataDir);
    await ensureDir(this.dealsDir);
    await ensureDir(this.analysisDir);
  }

  // Deal operations
  async saveDeal(deal: Deal): Promise<void> {
    const dealDir = path.join(this.dealsDir, deal.id);
    await ensureDir(dealDir);
    
    const dealPath = path.join(dealDir, 'deal.json');
    await writeJSON(dealPath, deal);
  }

  async getDeal(dealId: string): Promise<Deal | null> {
    const dealPath = path.join(this.dealsDir, dealId, 'deal.json');
    return readJSON<Deal>(dealPath);
  }

  async listDeals(): Promise<Deal[]> {
    try {
      const dealDirs = await fs.readdir(this.dealsDir);
      const deals: Deal[] = [];

      for (const dealId of dealDirs) {
        const deal = await this.getDeal(dealId);
        if (deal) {
          deals.push(deal);
        }
      }

      return deals;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  // Call operations
  async saveCall(call: Call): Promise<void> {
    const callsDir = path.join(this.dealsDir, call.dealId, 'calls');
    await ensureDir(callsDir);
    
    const callPath = path.join(callsDir, `${call.id}.json`);
    await writeJSON(callPath, call);
  }

  async getCall(dealId: string, callId: string): Promise<Call | null> {
    const callPath = path.join(this.dealsDir, dealId, 'calls', `${callId}.json`);
    return readJSON<Call>(callPath);
  }

  async listCallsForDeal(dealId: string): Promise<Call[]> {
    const callsDir = path.join(this.dealsDir, dealId, 'calls');
    
    try {
      const callFiles = await fs.readdir(callsDir);
      const calls: Call[] = [];

      for (const file of callFiles) {
        if (file.endsWith('.json')) {
          const callId = file.replace('.json', '');
          const call = await this.getCall(dealId, callId);
          if (call) {
            calls.push(call);
          }
        }
      }

      // Sort by date
      calls.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      return calls;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  // Transcript operations
  async saveTranscript(transcript: Transcript, dealId: string): Promise<void> {
    const transcriptsDir = path.join(this.dealsDir, dealId, 'transcripts');
    await ensureDir(transcriptsDir);
    
    const transcriptPath = path.join(transcriptsDir, `${transcript.callId}.json`);
    await writeJSON(transcriptPath, transcript);
  }

  async getTranscript(dealId: string, callId: string): Promise<Transcript | null> {
    const transcriptPath = path.join(this.dealsDir, dealId, 'transcripts', `${callId}.json`);
    return readJSON<Transcript>(transcriptPath);
  }

  // Sync metadata operations
  async saveSyncMetadata(metadata: SyncMetadata): Promise<void> {
    await writeJSON(this.syncMetadataPath, metadata);
  }

  async getSyncMetadata(): Promise<SyncMetadata | null> {
    return readJSON<SyncMetadata>(this.syncMetadataPath);
  }
}



