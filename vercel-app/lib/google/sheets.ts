/**
 * Google Sheets client for deal tracking
 * Uses service account authentication
 */

import { google } from 'googleapis';

interface DealTrackingData {
  opportunity: string;
  account: string;
  opportunityOwner: string;
  arr: number | null;
  closeDate: string | null;
  oppStage: string;
  probability: number | null;
  // These would come from Claude analysis
  dealSummary?: string;
  currentNextSteps?: string;
  untappedOpportunities?: string;
  risks?: string;
}

export class GoogleSheetsClient {
  private sheets;
  private spreadsheetId: string;

  constructor(
    serviceAccountEmail: string,
    privateKey: string,
    spreadsheetId: string
  ) {
    this.spreadsheetId = spreadsheetId;

    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  /**
   * Append a row of deal tracking data to the sheet
   */
  async appendDealTracking(data: DealTrackingData, sheetName: string = 'Manager View'): Promise<void> {
    console.log(`[Google Sheets] Appending deal tracking for: ${data.opportunity}`);

    const row = [
      data.opportunity,
      data.account,
      data.opportunityOwner,
      '', // Manager - to be filled manually or later
      data.dealSummary || '',
      data.currentNextSteps || '',
      data.untappedOpportunities || '',
      data.risks || '',
      data.arr ? data.arr.toString() : '',
      data.closeDate || '',
      data.oppStage,
      data.probability ? data.probability.toString() : '',
    ];

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:L`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });

      console.log('[Google Sheets] Successfully appended row');
    } catch (error) {
      console.error('[Google Sheets] Failed to append row:', error);
      throw error;
    }
  }

  /**
   * Update or insert a deal row (upsert by opportunity name)
   */
  async upsertDealTracking(data: DealTrackingData, sheetName: string = 'Manager View'): Promise<void> {
    console.log(`[Google Sheets] Upserting deal tracking for: ${data.opportunity}`);

    try {
      // First, try to find existing row with this opportunity
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:A`,
      });

      const values = response.data.values || [];
      let rowIndex = -1;

      for (let i = 0; i < values.length; i++) {
        if (values[i][0] === data.opportunity) {
          rowIndex = i + 1; // Sheets is 1-indexed
          break;
        }
      }

      const row = [
        data.opportunity,
        data.account,
        data.opportunityOwner,
        '', // Manager
        data.dealSummary || '',
        data.currentNextSteps || '',
        data.untappedOpportunities || '',
        data.risks || '',
        data.arr ? data.arr.toString() : '',
        data.closeDate || '',
        data.oppStage,
        data.probability ? data.probability.toString() : '',
      ];

      if (rowIndex > 0) {
        // Update existing row
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A${rowIndex}:L${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [row],
          },
        });
        console.log(`[Google Sheets] Updated existing row ${rowIndex}`);
      } else {
        // Append new row
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A:L`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [row],
          },
        });
        console.log('[Google Sheets] Appended new row');
      }
    } catch (error) {
      console.error('[Google Sheets] Failed to upsert row:', error);
      throw error;
    }
  }

  /**
   * Test connection by reading sheet metadata
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      console.log('[Google Sheets] Connected to:', response.data.properties?.title);
      return true;
    } catch (error) {
      console.error('[Google Sheets] Connection test failed:', error);
      return false;
    }
  }
}

/**
 * Create a GoogleSheetsClient from environment variables
 */
export function createGoogleSheetsClient(): GoogleSheetsClient | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  // Support both base64-encoded key (GOOGLE_PRIVATE_KEY_BASE64) and raw key (GOOGLE_PRIVATE_KEY)
  let privateKey: string | undefined;
  if (process.env.GOOGLE_PRIVATE_KEY_BASE64) {
    privateKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, 'base64').toString('utf-8');
  } else {
    privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  }

  if (!email || !privateKey || !spreadsheetId) {
    console.warn('[Google Sheets] Missing required environment variables');
    return null;
  }

  return new GoogleSheetsClient(email, privateKey, spreadsheetId);
}
