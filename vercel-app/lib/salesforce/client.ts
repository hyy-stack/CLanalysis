/**
 * Salesforce API client for fetching Opportunity data
 * Uses OAuth 2.0 with refresh token for authentication
 */

interface SalesforceTokenResponse {
  access_token: string;
  instance_url: string;
  token_type: string;
  issued_at: string;
}

interface SalesforceOpportunity {
  Id: string;
  Name: string;
  StageName: string;
  Amount?: number;
  Role_Segment__c?: string;
  ARR__c?: number;
}

export class SalesforceClient {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
    private readonly instanceUrl: string
  ) {}

  /**
   * Get a valid access token, refreshing if necessary
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token (with 5 minute buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300000) {
      return this.accessToken;
    }

    console.log('[Salesforce] Refreshing access token');

    const tokenUrl = `${this.instanceUrl}/services/oauth2/token`;

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Salesforce] Token refresh failed:', errorText);
      throw new Error(`Salesforce token refresh failed (${response.status}): ${errorText}`);
    }

    const tokenData: SalesforceTokenResponse = await response.json();

    this.accessToken = tokenData.access_token;
    // Salesforce tokens typically last 2 hours, set expiry to 1.5 hours from now
    this.tokenExpiresAt = Date.now() + 90 * 60 * 1000;

    console.log('[Salesforce] Access token refreshed successfully');
    return this.accessToken;
  }

  /**
   * Make an authenticated request to Salesforce API
   */
  private async request<T>(endpoint: string): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.instanceUrl}${endpoint}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Salesforce API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Fetch an Opportunity by its Salesforce ID
   */
  async getOpportunity(opportunityId: string): Promise<SalesforceOpportunity | null> {
    console.log(`[Salesforce] Fetching opportunity: ${opportunityId}`);

    try {
      // Query specific fields including Role_Segment__c and ARR__c
      const fields = ['Id', 'Name', 'StageName', 'Amount', 'Role_Segment__c', 'ARR__c'].join(',');
      const endpoint = `/services/data/v59.0/sobjects/Opportunity/${opportunityId}?fields=${fields}`;

      const opportunity = await this.request<SalesforceOpportunity>(endpoint);

      console.log(`[Salesforce] Retrieved opportunity: ${opportunity.Name}, Role_Segment__c: ${opportunity.Role_Segment__c || 'null'}`);
      return opportunity;
    } catch (error) {
      console.error(`[Salesforce] Failed to fetch opportunity ${opportunityId}:`, error);
      return null;
    }
  }

  /**
   * Fetch Role_Segment__c for an Opportunity
   */
  async getRoleSegment(opportunityId: string): Promise<string | null> {
    const opportunity = await this.getOpportunity(opportunityId);
    return opportunity?.Role_Segment__c || null;
  }

  /**
   * Fetch Role_Segment__c and ARR__c for an Opportunity
   */
  async getOpportunityFields(opportunityId: string): Promise<{ roleSegment: string | null; arr: number | null }> {
    const opportunity = await this.getOpportunity(opportunityId);
    return {
      roleSegment: opportunity?.Role_Segment__c || null,
      arr: opportunity?.ARR__c || null,
    };
  }
}

/**
 * Create a SalesforceClient instance from environment variables
 */
export function createSalesforceClient(): SalesforceClient | null {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  const refreshToken = process.env.SALESFORCE_REFRESH_TOKEN;
  const instanceUrl = process.env.SALESFORCE_INSTANCE_URL;

  if (!clientId || !clientSecret || !refreshToken || !instanceUrl) {
    console.warn('[Salesforce] Missing required environment variables, Salesforce integration disabled');
    return null;
  }

  return new SalesforceClient(clientId, clientSecret, refreshToken, instanceUrl);
}
