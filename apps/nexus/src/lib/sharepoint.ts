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

import { getAppOnlyToken } from './graph-app-token';

// Re-export for backwards compatibility
export { getAppOnlyToken };

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB — threshold for upload sessions

/**
 * Encode a sharing URL for the Graph API /shares endpoint.
 * Format: "u!" + base64url(sharingUrl)
 */
function encodeSharingUrl(url: string): string {
  const base64 = Buffer.from(url, 'utf-8').toString('base64');
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `u!${base64url}`;
}

/**
 * Resolve a Graph /shares-encoded sharing link (ANY type: /:v:/ video, /:b:/
 * document, /:w:/ word, …) or a direct webUrl to a pre-authenticated download
 * URL. Returns null when it cannot be resolved so the caller can try another
 * strategy before giving up.
 *
 * IMPORTANT: the driveItem is requested WITHOUT `$select`. Microsoft Graph
 * strips the `@microsoft.graph.downloadUrl` instance annotation whenever it is
 * named in `$select` (the same gotcha getSharePointDownloadUrl documents and
 * works around). The old `?$select=id,@microsoft.graph.downloadUrl` call is
 * exactly why document (/:b:/) links silently returned no download URL and the
 * caller threw "Could not resolve SharePoint URL to a streaming URL". If the
 * annotation is still absent, /content 302-redirects to the download URL.
 */
async function shareDownloadUrl(encoded: string, token: string): Promise<string | null> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.ok) {
    const data = await res.json();
    if (data['@microsoft.graph.downloadUrl']) {
      return data['@microsoft.graph.downloadUrl'];
    }
  }

  // Fallback: /content 302-redirects to a short-lived pre-authenticated download URL.
  const contentRes = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem/content`,
    { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' }
  );
  if (contentRes.status === 302) {
    return contentRes.headers.get('Location');
  }
  return null;
}

/**
 * Unwrap a Teams "meeting recap" link to the file it is about.
 *
 * `https://teams.microsoft.com/l/meetingrecap?...&fileUrl=<encoded>&threadId=...`
 * is what Teams puts on the clipboard for a class recording, and it is what some
 * stored `recording_url` values are. Nothing about that host is resolvable as a
 * file: only the `fileUrl` parameter points at the video. Anything else is
 * returned untouched, so this is safe to run over every URL.
 */
export function unwrapTeamsRecapUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().endsWith('teams.microsoft.com')) return url;
    const fileUrl = u.searchParams.get('fileUrl');
    return fileUrl && /^https:\/\//i.test(fileUrl) ? fileUrl : url;
  } catch {
    return url;
  }
}

/**
 * Resolve a SharePoint video URL to a temporary streaming URL.
 * Works with sharing links, stream.aspx URLs, direct webUrls, and Teams recap links.
 * Returns a pre-authenticated download URL that can be used in <video> elements.
 */
export async function getSharePointStreamUrl(sharepointUrl: string): Promise<string> {
  const token = await getAppOnlyToken();
  const target = unwrapTeamsRecapUrl(sharepointUrl);
  const u = new URL(target);

  // For sharing links (/:v:/ videos), use the /shares endpoint.
  if (u.pathname.match(/\/:v:\//)) {
    const dl = await shareDownloadUrl(encodeSharingUrl(target), token);
    if (dl) return dl;
  }

  // For stream.aspx or embed.aspx URLs, extract the file path and use site drive
  if (u.pathname.includes('stream.aspx') || u.pathname.includes('embed.aspx')) {
    // stream.aspx?id=/sites/siteName/Shared Documents/file.mp4
    const filePath = u.searchParams.get('id');
    if (filePath) {
      // Extract site name from path: /sites/siteName/...
      const siteMatch = filePath.match(/\/sites\/([^/]+)/);
      if (siteMatch) {
        const siteName = siteMatch[1];
        // Get the site
        const siteRes = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${u.hostname}:/sites/${siteName}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (siteRes.ok) {
          const site = await siteRes.json();
          // Get file by path relative to site
          const relativePath = filePath.replace(`/sites/${siteName}`, '');
          const fileRes = await fetch(
            `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root:${relativePath}?$select=id,@microsoft.graph.downloadUrl`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (fileRes.ok) {
            const fileData = await fileRes.json();
            if (fileData['@microsoft.graph.downloadUrl']) {
              return fileData['@microsoft.graph.downloadUrl'];
            }
          }
        }
      }
    }

    // For embed.aspx?UniqueId=GUID, try resolving via search
    const uniqueId = u.searchParams.get('UniqueId');
    if (uniqueId) {
      // Extract site name from path: /sites/siteName/_layouts/...
      const siteMatch = u.pathname.match(/\/sites\/([^/]+)/);
      if (siteMatch) {
        const siteName = siteMatch[1];
        const siteRes = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${u.hostname}:/sites/${siteName}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (siteRes.ok) {
          const site = await siteRes.json();
          // Search by UniqueId
          const searchRes = await fetch(
            `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root/search(q='${uniqueId}')?$select=id,@microsoft.graph.downloadUrl`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const match = searchData.value?.[0];
            if (match?.['@microsoft.graph.downloadUrl']) {
              return match['@microsoft.graph.downloadUrl'];
            }
          }
        }
      }
    }
  }

  // For direct SharePoint webUrls AND non-video sharing links (/:b:/ documents,
  // /:w:/ word, /:x:/ excel, /:p:/ powerpoint, /:i:/ image, …). This is the
  // path a pasted PDF/document reference takes.
  if (u.hostname.includes('sharepoint.com') && !u.pathname.includes('_layouts')) {
    const dl = await shareDownloadUrl(encodeSharingUrl(target), token);
    if (dl) return dl;
  }

  throw new Error('Could not resolve SharePoint URL to a streaming URL');
}

export interface ResolvedShareItem {
  /** Graph driveItem id. */
  id: string;
  /** File name (with extension). */
  name: string;
  /** MIME type reported by Graph, when available. */
  mimeType: string | null;
  /** Size in bytes, when available. */
  size: number | null;
}

/**
 * Resolve a pasted OneDrive/SharePoint sharing URL to its Graph driveItem
 * (id + name + mime + size), across any site/drive, via the /shares endpoint.
 * Used to LINK an existing document into an assignment without re-uploading it.
 * The bytes are later streamed on demand by getSharePointStreamUrl(shareUrl).
 */
export async function resolveShareUrlToItem(shareUrl: string): Promise<ResolvedShareItem> {
  const token = await getAppOnlyToken();
  const encoded = encodeSharingUrl(shareUrl);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem?$select=id,name,file,size`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Could not resolve the shared link: ${res.status} ${err}`);
  }
  const item = await res.json();
  return {
    id: item.id,
    name: item.name || 'document',
    mimeType: item.file?.mimeType || null,
    size: typeof item.size === 'number' ? item.size : null,
  };
}

/**
 * A PDF rendition of an Office file, as a short-lived pre-authenticated URL.
 *
 * This is what lets a teacher attach a PowerPoint and a student read it in the
 * app. Nothing in this stack can render a .pptx: the secure reader is pdf.js, and
 * handing the browser the real file would just download it, which is exactly what
 * the watermark and the download block exist to prevent. Graph will convert
 * pptx, docx and xlsx server-side, so the deck arrives as a PDF and every
 * protection downstream keeps working unchanged.
 *
 * Returns null rather than throwing when the conversion is refused, so the caller
 * can fall back to "open it in SharePoint" instead of presenting a dead viewer.
 * Graph declines for files past its size limit and for formats it cannot render.
 *
 * NOT cached. A conversion is one Graph call and the response carries an hour of
 * browser caching, so a student reading a deck twice pays for it once. Writing
 * the rendition back to SharePoint would need Files.ReadWrite.All app permission,
 * which this app does not hold today.
 */
export async function getSharePointPdfRendition(target: {
  itemId?: string | null;
  shareUrl?: string | null;
}): Promise<string | null> {
  const token = await getAppOnlyToken();

  let url: string;
  if (target.shareUrl) {
    // A LINKED file can live on any site or drive, so it has to be reached the
    // same way its bytes are, through /shares.
    const encoded = encodeSharingUrl(unwrapTeamsRecapUrl(target.shareUrl));
    url = `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem/content?format=pdf`;
  } else if (target.itemId) {
    const siteId = await getSiteId(token);
    url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${target.itemId}/content?format=pdf`;
  } else {
    return null;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'manual',
  });

  // 302 to a pre-authenticated URL is the success path, the same shape /content
  // uses without the format parameter.
  if (res.status === 302) return res.headers.get('Location');

  console.warn(`[sharepoint] PDF rendition unavailable: ${res.status}`);
  return null;
}

/** One search hit, narrowed to what a file picker actually renders. */
export interface SiteDriveItem {
  id: string;
  name: string;
  webUrl: string;
  mimeType: string | null;
  size: number | null;
  lastModified: string | null;
  /** Present on folders only, so the picker can grey them out. */
  isFolder: boolean;
}

function toDriveItem(item: any): SiteDriveItem {
  return {
    id: item.id,
    name: item.name || 'Untitled',
    webUrl: item.webUrl || '',
    mimeType: item.file?.mimeType || null,
    size: typeof item.size === 'number' ? item.size : null,
    lastModified: item.lastModifiedDateTime || null,
    isFolder: !!item.folder,
  };
}

/**
 * Search the shared Neram document library for a file to attach to a class.
 *
 * App-only against the one configured site, which is the whole reason this needs
 * no new Graph permission and no consent prompt: searching a teacher's PERSONAL
 * OneDrive would need the delegated Files.Read.All scope, and adding that to the
 * MSAL config makes every teacher re-consent at next sign-in.
 *
 * The consequence to tell users about: a deck that exists only in someone's
 * personal OneDrive will not appear here. Move it into the Neram site, or paste
 * its share link, which resolveShareUrlToItem handles across any drive.
 */
export async function searchSiteDrive(query: string, limit = 25): Promise<SiteDriveItem[]> {
  const q = query.trim();
  if (!q) return [];

  const token = await getAppOnlyToken();
  const siteId = await getSiteId(token);

  // Single quotes inside the OData search term have to be doubled, or a file
  // called "Ravi's notes" turns the query into a syntax error.
  const escaped = encodeURIComponent(q.replace(/'/g, "''"));
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/search(q='${escaped}')?$top=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`SharePoint search failed: ${res.status} ${err}`);
  }

  const data = await res.json().catch(() => ({}));
  return ((data?.value || []) as any[]).map(toDriveItem);
}

/**
 * List one folder of the shared library, so the picker can be browsed as well as
 * searched. An empty path lists the root.
 */
export async function browseSiteFolder(path = '', limit = 100): Promise<SiteDriveItem[]> {
  const token = await getAppOnlyToken();
  const siteId = await getSiteId(token);

  const clean = path.replace(/^\/+|\/+$/g, '');
  const base = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root`;
  const url = clean
    ? `${base}:/${encodeURI(clean)}:/children?$top=${limit}`
    : `${base}/children?$top=${limit}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`SharePoint browse failed: ${res.status} ${err}`);
  }

  const data = await res.json().catch(() => ({}));
  return ((data?.value || []) as any[]).map(toDriveItem);
}

/**
 * A read-only, organization-scoped link to a file, for the "Open in SharePoint"
 * escape hatch on a resource card.
 *
 * `type: 'view'` is the guarantee that matters: a student following this link can
 * read the deck in SharePoint and cannot edit it. Same call uploadToSharePoint
 * already makes for the files it uploads.
 */
export async function createViewLink(itemId: string): Promise<string | null> {
  const token = await getAppOnlyToken();
  const siteId = await getSiteId(token);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/createLink`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'view', scope: 'organization' }),
    },
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.link?.webUrl || null;
}

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
 * Get a fresh pre-authenticated download URL for a SharePoint file by item ID.
 */
export async function getSharePointDownloadUrl(itemId: string): Promise<string> {
  const token = await getAppOnlyToken();
  const siteId = await getSiteId(token);

  // Note: $select=@microsoft.graph.downloadUrl strips the annotation from the response.
  // We must request without $select or use /content redirect to get the download URL.
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.ok) {
    const data = await res.json();
    if (data['@microsoft.graph.downloadUrl']) {
      return data['@microsoft.graph.downloadUrl'];
    }
  }

  // Fallback: use /content endpoint which returns a 302 redirect to the download URL
  const contentRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/content`,
    { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' }
  );
  if (contentRes.status === 302) {
    const location = contentRes.headers.get('Location');
    if (location) return location;
  }

  throw new Error('Could not resolve download URL for SharePoint item');
}

/**
 * Resolve a Microsoft Graph thumbnail URL for a SharePoint driveItem (e.g. a PDF first page or an
 * image). Returns null when Graph has no thumbnail for the item (unsupported type, or still being
 * generated asynchronously just after upload). Uses the app-only token.
 *
 * @param itemId - Graph driveItem id
 * @param size   - a named preset ('small'≈96px, 'medium'≈176px, 'large'≈800px longest edge) OR a
 *                 Graph custom crop like 'c800x0' (0 = preserve aspect on that axis) for a sharper,
 *                 display-sized thumbnail.
 */
export async function getSharePointThumbnailUrl(
  itemId: string,
  size: string = 'large'
): Promise<string | null> {
  const token = await getAppOnlyToken();
  const siteId = await getSiteId(token);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/thumbnails/0/${size}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.url || null;
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
