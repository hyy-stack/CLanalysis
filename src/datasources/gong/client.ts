import type { GongCallsResponse, GongTranscriptResponse } from './types.js';

/**
 * Gong API client
 * Wraps the Gong REST API with authentication and error handling
 */
export class GongClient {
  private readonly baseUrl = 'https://api.gong.io';
  private readonly accessKey: string;
  private readonly accessKeySecret: string;

  constructor(accessKey: string, accessKeySecret: string) {
    this.accessKey = accessKey;
    this.accessKeySecret = accessKeySecret;
  }

  /**
   * Get authorization header for Gong API (Basic Auth)
   */
  private getAuthHeader(): string {
    const credentials = `${this.accessKey}:${this.accessKeySecret}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  /**
   * Make a request to the Gong API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
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
      throw new Error(
        `Gong API error (${response.status}): ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * List calls with optional filters - uses GET for simple listing
   * @param params - Query parameters for filtering calls
   */
  async listCalls(params: {
    fromDateTime?: string;
    toDateTime?: string;
    cursor?: string;
  } = {}): Promise<GongCallsResponse> {
    const queryParams = new URLSearchParams();
    
    if (params.fromDateTime) {
      queryParams.append('fromDateTime', params.fromDateTime);
    }
    if (params.toDateTime) {
      queryParams.append('toDateTime', params.toDateTime);
    }
    if (params.cursor) {
      queryParams.append('cursor', params.cursor);
    }

    const endpoint = `/v2/calls?${queryParams.toString()}`;
    return this.request<GongCallsResponse>(endpoint);
  }

  /**
   * List calls for a specific account/company
   * @param accountId - The CRM account/company identifier  
   * @param fromDate - Optional start date filter
   */
  async listCallsForAccount(accountId: string, fromDate?: string): Promise<GongCallsResponse> {
    // According to Gong docs, use /v2/calls/extensive with POST
    const endpoint = `/v2/calls/extensive`;
    
    const requestBody = {
      filter: {
        companyIds: [accountId]  // Try companyIds instead of companyCrmIds
      },
      contentSelector: {
        exposedFields: {
          content: true,
          structure: true
        }
      }
    };

    console.log('[Gong] POST /v2/calls/extensive with companyIds filter');
    
    return this.request<GongCallsResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  }

  /**
   * Get transcript for a specific call
   * @param callId - The call identifier
   * @param callDate - Optional call date to help with filtering
   */
  async getCallTranscript(callId: string, callDate?: string): Promise<GongTranscriptResponse> {
    const endpoint = `/v2/calls/transcript`;
    
    // Gong requires BOTH callIds and a date period
    // If we have the call date, use a narrow range around it
    // Otherwise, use a wide range (last year)
    let fromDateTime: string;
    let toDateTime: string;
    
    if (callDate) {
      const date = new Date(callDate);
      // Search from 1 day before to 1 day after
      const dayBefore = new Date(date);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(date);
      dayAfter.setDate(dayAfter.getDate() + 1);
      
      fromDateTime = dayBefore.toISOString();
      toDateTime = dayAfter.toISOString();
    } else {
      // Fallback: search last year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      fromDateTime = oneYearAgo.toISOString();
      toDateTime = new Date().toISOString();
    }
    
    return this.request<GongTranscriptResponse>(endpoint, {
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

  /**
   * Get a specific call by ID
   * @param callId - The call identifier
   */
  async getCall(callId: string): Promise<any> {
    const endpoint = `/v2/calls/${callId}`;
    return this.request(endpoint);
  }

  /**
   * Test the connection to Gong API
   */
  async testConnection(): Promise<boolean> {
    try {
      // Try to list calls with a small limit to test auth
      await this.listCalls();
      return true;
    } catch (error) {
      console.error('Gong connection test failed:', error);
      return false;
    }
  }
}

