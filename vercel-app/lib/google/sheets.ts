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
  sfdcProbability: number | null;
  anrokProbability?: number | null; // Claude's probability assessment
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
   * Skips column D (Manager) to preserve any formulas there
   */
  async appendDealTracking(data: DealTrackingData, sheetName: string = 'All Deals'): Promise<void> {
    console.log(`[Google Sheets] Appending deal tracking for: ${data.opportunity}`);

    // First, append a row with just columns A-C
    const rowAC = [
      data.opportunity,
      data.account,
      data.opportunityOwner,
    ];

    try {
      // Append creates a new row - we need to find where it landed to update E-M
      const appendResponse = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:C`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowAC],
        },
      });

      // Extract the row number from the updated range (e.g., "All Deals!A5:C5" -> 5)
      const updatedRange = appendResponse.data.updates?.updatedRange || '';
      const rowMatch = updatedRange.match(/!A(\d+):/);
      const rowNumber = rowMatch ? parseInt(rowMatch[1]) : null;

      if (rowNumber) {
        // Now update columns E-M for that row (skipping D which has formula)
        const rowEM = [
          data.dealSummary || '',
          data.currentNextSteps || '',
          data.untappedOpportunities || '',
          data.risks || '',
          data.arr ? data.arr.toString() : '',
          data.closeDate || '',
          data.oppStage,
          data.anrokProbability != null ? data.anrokProbability.toString() : '',
          data.sfdcProbability != null ? data.sfdcProbability.toString() : '',
        ];

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!E${rowNumber}:M${rowNumber}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [rowEM],
          },
        });
      }

      console.log('[Google Sheets] Successfully appended row');
    } catch (error) {
      console.error('[Google Sheets] Failed to append row:', error);
      throw error;
    }
  }

  /**
   * Update or insert a deal row (upsert by opportunity name)
   * Skips column D (Manager) to preserve any formulas there
   */
  async upsertDealTracking(data: DealTrackingData, sheetName: string = 'All Deals'): Promise<void> {
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

      // Columns A-C (skip D which has Manager formula)
      const rowAC = [
        data.opportunity,
        data.account,
        data.opportunityOwner,
      ];

      // Columns E-M (everything after Manager)
      const rowEM = [
        data.dealSummary || '',
        data.currentNextSteps || '',
        data.untappedOpportunities || '',
        data.risks || '',
        data.arr ? data.arr.toString() : '',
        data.closeDate || '',
        data.oppStage,
        data.anrokProbability != null ? data.anrokProbability.toString() : '',
        data.sfdcProbability != null ? data.sfdcProbability.toString() : '',
      ];

      if (rowIndex > 0) {
        // Update existing row - write A-C and E-M separately to skip D
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A${rowIndex}:C${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [rowAC],
          },
        });

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!E${rowIndex}:M${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [rowEM],
          },
        });

        console.log(`[Google Sheets] Updated existing row ${rowIndex}`);
      } else {
        // Append new row using the appendDealTracking method
        await this.appendDealTracking(data, sheetName);
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
    console.log('[Google Sheets] Using base64 key, length:', process.env.GOOGLE_PRIVATE_KEY_BASE64.length);
    privateKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, 'base64').toString('utf-8');
    console.log('[Google Sheets] Decoded key starts with:', privateKey.substring(0, 40));
    console.log('[Google Sheets] Decoded key ends with:', privateKey.substring(privateKey.length - 40));
  } else if (process.env.GOOGLE_PRIVATE_KEY) {
    console.log('[Google Sheets] Using raw key, length:', process.env.GOOGLE_PRIVATE_KEY.length);
    privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    console.log('[Google Sheets] Processed key starts with:', privateKey.substring(0, 40));
  } else {
    console.log('[Google Sheets] No private key found');
  }

  if (!email || !privateKey || !spreadsheetId) {
    console.warn('[Google Sheets] Missing required environment variables');
    return null;
  }

  return new GoogleSheetsClient(email, privateKey, spreadsheetId);
}
