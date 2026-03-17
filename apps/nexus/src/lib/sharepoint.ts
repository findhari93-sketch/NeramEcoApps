/**
 * SharePoint file operations via Microsoft Graph API.
 *
 * Uploads files to a dedicated SharePoint site's document library,
 * creates organization-scoped sharing links for student access, and handles deletion.
 *
 * Environment variable required:
 *   SHAREPOINT_SITE_ID — the SharePoint site ID (format: {hostname},{siteId},{webId})
 *
 * Falls back to discovering the site from SHAREPOINT_SITE_URL if SHAREPOINT_SITE_ID is not set.
 */

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB — threshold for upload sessions

interface SharePointUploadResult {
  /** SharePoint/OneDrive item ID (for deletion) */
  itemId: string;
  /** Direct download URL via sharing link (org-scoped) */
  sharingUrl: string;
  /** Web URL for viewing in browser */
  webUrl: string;
}

/**
 * Get the SharePoint site ID from environment or by discovery.
 */
async function getSiteId(token: string): Promise<string> {
  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (siteId) return siteId;

  // Discover from URL: e.g. "neramclasses.sharepoint.com:/sites/NeramStorage"
  const siteUrl = process.env.SHAREPOINT_SITE_URL;
  if (!siteUrl) {
    throw new Error('SHAREPOINT_SITE_ID or SHAREPOINT_SITE_URL environment variable is required');
  }

  // Parse URL like "neramclasses.sharepoint.com/sites/NeramStorage"
  const match = siteUrl.match(/^([^/]+)(\/.*)?$/);
  if (!match) throw new Error(`Invalid SHAREPOINT_SITE_URL: ${siteUrl}`);

  const hostname = match[1];
  const path = match[2] || '';

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${hostname}:${path}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Failed to discover SharePoint site: ${res.status} ${err}`);
  }

  const site = await res.json();
  return site.id;
}

/**
 * Upload a file to the SharePoint document library.
 *
 * - Files ≤ 4 MB: simple PUT upload
 * - Files > 4 MB: resumable upload session (chunked)
 *
 * @param token - Microsoft Graph bearer token (teacher's delegated token)
 * @param filePath - Path within the document library (e.g., "nexus/chapters/abc/pdf/123.pdf")
 * @param buffer - File content as Uint8Array
 * @param contentType - MIME type
 */
export async function uploadToSharePoint(
  token: string,
  filePath: string,
  buffer: Uint8Array,
  contentType: string
): Promise<SharePointUploadResult> {
  const siteId = await getSiteId(token);
  let item: { id: string; webUrl: string };

  if (buffer.length <= CHUNK_SIZE) {
    // Simple upload for small files
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${filePath}:/content`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
          'Content-Length': String(buffer.length),
        },
        body: Buffer.from(buffer),
      }
    );

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`SharePoint upload failed: ${res.status} ${err}`);
    }

    item = await res.json();
  } else {
    // Create upload session for large files
    const sessionRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${filePath}:/createUploadSession`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': 'replace',
          },
        }),
      }
    );

    if (!sessionRes.ok) {
      const err = await sessionRes.text().catch(() => '');
      throw new Error(`Failed to create upload session: ${sessionRes.status} ${err}`);
    }

    const session = await sessionRes.json();
    const uploadUrl = session.uploadUrl;
    const totalSize = buffer.length;

    // Upload in chunks
    let offset = 0;
    let lastResponse: Response | null = null;

    while (offset < totalSize) {
      const end = Math.min(offset + CHUNK_SIZE, totalSize);
      const chunk = buffer.slice(offset, end);

      lastResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
        },
        body: Buffer.from(chunk),
      });

      if (!lastResponse.ok && lastResponse.status !== 202) {
        const err = await lastResponse.text().catch(() => '');
        throw new Error(`Chunk upload failed at offset ${offset}: ${lastResponse.status} ${err}`);
      }

      offset = end;
    }

    if (!lastResponse || (!lastResponse.ok && lastResponse.status !== 201 && lastResponse.status !== 200)) {
      throw new Error('Upload session completed but no valid response received');
    }

    item = await lastResponse.json();
  }

  // Create an anonymous sharing link for student access
  const shareRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${item.id}/createLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'view',
        scope: 'organization',
      }),
    }
  );

  let sharingUrl = item.webUrl; // fallback
  if (shareRes.ok) {
    const shareData = await shareRes.json();
    sharingUrl = shareData.link?.webUrl || item.webUrl;
  } else {
    console.warn('Failed to create sharing link, using webUrl as fallback');
  }

  // Get a direct download URL for the file
  const downloadRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${item.id}?select=@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  let downloadUrl = sharingUrl;
  if (downloadRes.ok) {
    const downloadData = await downloadRes.json();
    if (downloadData['@microsoft.graph.downloadUrl']) {
      downloadUrl = downloadData['@microsoft.graph.downloadUrl'];
    }
  }

  return {
    itemId: item.id,
    sharingUrl: downloadUrl,
    webUrl: item.webUrl,
  };
}

/**
 * Delete a file from SharePoint by its item ID.
 */
export async function deleteFromSharePoint(
  token: string,
  itemId: string
): Promise<void> {
  const siteId = await getSiteId(token);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  // 204 = deleted, 404 = already gone (both OK)
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const err = await res.text().catch(() => '');
    throw new Error(`SharePoint delete failed: ${res.status} ${err}`);
  }
}
