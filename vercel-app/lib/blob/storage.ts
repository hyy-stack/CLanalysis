import { put, del } from '@vercel/blob';

/**
 * Vercel Blob storage operations for large content
 */

/**
 * Upload a call transcript to Blob storage
 * @param callId - The call identifier
 * @param transcript - The transcript object
 * @returns Blob URL
 */
export async function uploadTranscript(
  callId: string,
  transcript: any
): Promise<string> {
  const filename = `transcripts/${callId}.json`;
  const content = JSON.stringify(transcript, null, 2);
  
  const blob = await put(filename, content, {
    access: 'public',
    contentType: 'application/json',
  });
  
  return blob.url;
}

/**
 * Upload an email body to Blob storage
 * @param emailId - Unique email identifier
 * @param body - Email body text
 * @returns Blob URL
 */
export async function uploadEmail(
  emailId: string,
  body: string
): Promise<string> {
  const filename = `emails/${emailId}.txt`;
  
  const blob = await put(filename, body, {
    access: 'public',
    contentType: 'text/plain',
  });
  
  return blob.url;
}

/**
 * Retrieve content from Blob storage
 * @param blobUrl - The Blob URL
 * @returns Content as string
 */
export async function retrieveContent(blobUrl: string): Promise<string> {
  try {
    const response = await fetch(blobUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.status}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error('Error retrieving blob content:', error);
    throw error;
  }
}

/**
 * Retrieve and parse JSON transcript from Blob
 * @param blobUrl - The Blob URL
 * @returns Parsed transcript object
 */
export async function retrieveTranscript(blobUrl: string): Promise<any> {
  const content = await retrieveContent(blobUrl);
  return JSON.parse(content);
}

/**
 * Delete a blob (cleanup utility)
 * @param blobUrl - The Blob URL to delete
 */
export async function deleteBlob(blobUrl: string): Promise<void> {
  try {
    await del(blobUrl);
  } catch (error) {
    console.error('Error deleting blob:', error);
    // Don't throw - deletion failures shouldn't break the flow
  }
}

