/**
 * Gong API client for server-side operations
 * Migrated from MVP with enhancements for webhook support
 */

export interface GongCall {
  id: string;
  url?: string;
  title?: string;
  scheduled?: string;
  started?: string;
  duration?: number;
  primaryUserId?: string;
  direction?: string;
  system?: string;
  workspaceId?: string;
  parties?: GongParty[];
}

export interface GongParty {
  id?: string;
  emailAddress?: string;
  name?: string;
  userId?: string;
  speakerId?: string;
  affiliation?: 'internal' | 'external' | 'unknown';
}

export interface GongTranscript {
  callId: string;
  transcript?: any[];
}

export class GongClient {
  private readonly baseUrl = 'https://api.gong.io';
  
  constructor(
    private readonly accessKey: string,
    private readonly accessKeySecret: string
  ) {}

  private getAuthHeader(): string {
    const credentials = `${this.accessKey}:${this.accessKeySecret}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gong API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get a specific call by ID with full details including parties
   */
  async getCall(callId: string): Promise<{ call: GongCall }> {
    // Use POST to /v2/calls with contentSelector to get parties
    const endpoint = `/v2/calls`;
    
    try {
      const response = await this.request<any>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          filter: {
            callIds: [callId],
          },
          contentSelector: {
            exposedFields: {
              parties: true,
              content: true,
            },
          },
        }),
      });
      
      // Extract the call from the response
      if (response.calls && response.calls.length > 0) {
        return { call: response.calls[0] };
      }
      
      // Fallback to simple GET if POST doesn't work
      const simpleEndpoint = `/v2/calls/${callId}`;
      return this.request(simpleEndpoint);
    } catch (error) {
      // Fallback to simple GET
      const simpleEndpoint = `/v2/calls/${callId}`;
      return this.request(simpleEndpoint);
    }
  }

  /**
   * List calls by CRM opportunity ID
   * Attempts to use Gong's CRM integration
   */
  async listCallsByCrmId(crmId: string, fromDate?: string, toDate?: string): Promise<GongCall[]> {
    const endpoint = `/v2/calls/extensive`;
    
    try {
      const requestBody: any = {
        filter: {
          companyCrmIds: [crmId],
        },
        contentSelector: {
          exposedFields: {
            content: true,
            structure: true,
          },
        },
      };
      
      if (fromDate) {
        requestBody.filter.fromDateTime = new Date(fromDate).toISOString();
      }
      if (toDate) {
        requestBody.filter.toDateTime = new Date(toDate).toISOString();
      }
      
      const response = await this.request<any>(endpoint, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      
      return response.calls || [];
    } catch (error) {
      console.error('[Gong Client] CRM filtering failed:', error);
      return [];
    }
  }

  /**
   * Get transcript for a specific call
   */
  async getCallTranscript(callId: string, callDate?: string): Promise<{ callTranscripts: GongTranscript[] }> {
    const endpoint = `/v2/calls/transcript`;
    
    // Build date range around the call
    let fromDateTime: string;
    let toDateTime: string;
    
    if (callDate) {
      const date = new Date(callDate);
      const dayBefore = new Date(date);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(date);
      dayAfter.setDate(dayAfter.getDate() + 1);
      
      fromDateTime = dayBefore.toISOString();
      toDateTime = dayAfter.toISOString();
    } else {
      // Fallback: last year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      fromDateTime = oneYearAgo.toISOString();
      toDateTime = new Date().toISOString();
    }
    
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          callIds: [callId],
          fromDateTime,
          toDateTime,
        },
      }),
    });
  }
}

