import { put, del, get as getBlob } from '@vercel/blob';

const PRIVATE_TOKEN = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;

/**
 * Vercel Blob storage operations for large content.
 * Uses the PRIVATE_BLOB_READ_WRITE_TOKEN for the private blob store.
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
    access: 'private',
    contentType: 'application/json',
    token: PRIVATE_TOKEN,
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
    access: 'private',
    contentType: 'text/plain',
    token: PRIVATE_TOKEN,
  });

  return blob.url;
}

/**
 * Retrieve content from Blob storage.
 * Detects whether the blob is in a public or private store based on the URL
 * and uses the appropriate retrieval method.
 * @param blobUrl - The Blob URL
 * @returns Content as string
 */
export async function retrieveContent(blobUrl: string): Promise<string> {
  try {
    if (blobUrl.includes('.private.blob.')) {
      const result = await getBlob(blobUrl, { access: 'private', token: PRIVATE_TOKEN });
      if (!result || result.statusCode !== 200) {
        throw new Error(`Failed to fetch private blob: ${result?.statusCode ?? 'not found'}`);
      }
      const reader = result.stream.getReader();
      const chunks: Uint8Array[] = [];
      let chunk = await reader.read();
      while (!chunk.done) {
        chunks.push(chunk.value);
        chunk = await reader.read();
      }
      return Buffer.concat(chunks).toString('utf-8');
    }

    // Public blob — direct fetch (legacy, during migration)
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
    const token = blobUrl.includes('.private.blob.') ? PRIVATE_TOKEN : undefined;
    await del(blobUrl, { token });
  } catch (error) {
    console.error('Error deleting blob:', error);
    // Don't throw - deletion failures shouldn't break the flow
  }
}

