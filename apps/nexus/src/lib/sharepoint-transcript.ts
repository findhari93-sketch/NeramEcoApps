/**
 * Fetch a Teams/SharePoint recording transcript (VTT) via Microsoft Graph.
 *
 * Extracted from api/modules/.../auto-generate so the class-recap generator can
 * reuse the exact resolution chain: sharing URL -> driveItem -> media/transcripts
 * (beta), with a sibling ".vtt" file fallback.
 *
 * Throws one of: NO_ACCESS | VIDEO_NOT_FOUND | NO_TRANSCRIPT (callers map these
 * to friendly messages), or a generic Error for unexpected Graph failures.
 */

/**
 * Normalize a pasted recording link to a URL that Graph can resolve.
 *
 * Teams surfaces the recording as a share link like
 *   https://teams.microsoft.com/l/meetingrecap?...&fileUrl=<encoded .mp4?web=1>&driveId=...&driveItemId=...
 * That teams.microsoft.com URL is NOT resolvable via /shares, but its `fileUrl`
 * query param is the real SharePoint file URL, which both getSharePointStreamUrl
 * and fetchTranscriptFromSharePoint already resolve. So pull out `fileUrl` when
 * present; otherwise return the input unchanged (a direct SharePoint file link
 * already works).
 */
export function normalizeRecordingUrl(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes('teams.microsoft.com')) {
      const fileUrl = u.searchParams.get('fileUrl');
      if (fileUrl) return fileUrl;
    }
  } catch {
    // Not a parseable URL — hand it back and let the caller surface any error.
  }
  return trimmed;
}

/** Encode a sharing URL for the Microsoft Graph /shares/ endpoint. */
export function encodeSharingUrl(url: string): string {
  const base64 = Buffer.from(url, 'utf-8').toString('base64');
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `u!${base64url}`;
}

export async function fetchTranscriptFromSharePoint(
  sharepointUrl: string,
  msToken: string,
): Promise<string> {
  const headers = { Authorization: `Bearer ${msToken}` };

  // Step 1: Resolve sharing URL to a DriveItem.
  const shareId = encodeSharingUrl(sharepointUrl);
  const driveItemRes = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`,
    { headers },
  );

  if (!driveItemRes.ok) {
    const status = driveItemRes.status;
    if (status === 403) throw new Error('NO_ACCESS');
    if (status === 404) throw new Error('VIDEO_NOT_FOUND');
    throw new Error(`Graph API error resolving share: ${status}`);
  }

  const driveItem = await driveItemRes.json();
  const { id: itemId, parentReference } = driveItem;
  const driveId = parentReference?.driveId;
  const siteId = parentReference?.siteId;

  if (!driveId || !itemId) {
    throw new Error('Could not resolve drive item from sharing URL');
  }

  // Step 2: Try the media/transcripts endpoint (beta).
  try {
    const transcriptsUrl = siteId
      ? `https://graph.microsoft.com/beta/sites/${siteId}/drives/${driveId}/items/${itemId}/media/transcripts`
      : `https://graph.microsoft.com/beta/drives/${driveId}/items/${itemId}/media/transcripts`;

    const transcriptsRes = await fetch(transcriptsUrl, { headers });
    if (transcriptsRes.ok) {
      const transcriptsData = await transcriptsRes.json();
      const transcripts = transcriptsData.value;
      if (transcripts && transcripts.length > 0) {
        const transcriptId = transcripts[0].id;
        const contentUrl = siteId
          ? `https://graph.microsoft.com/beta/sites/${siteId}/drives/${driveId}/items/${itemId}/media/transcripts/${transcriptId}/content`
          : `https://graph.microsoft.com/beta/drives/${driveId}/items/${itemId}/media/transcripts/${transcriptId}/content`;
        const contentRes = await fetch(contentUrl, { headers });
        if (contentRes.ok) return await contentRes.text();
      }
    }
  } catch {
    // Fall through to the sibling-file fallback.
  }

  // Step 3: Fallback — a ".vtt" sibling file in the same folder.
  try {
    const parentId = parentReference?.id;
    if (parentId) {
      const childrenRes = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}/children`,
        { headers },
      );
      if (childrenRes.ok) {
        const childrenData = await childrenRes.json();
        const vttFile = childrenData.value?.find((f: { name?: string }) =>
          f.name?.toLowerCase().endsWith('.vtt'),
        );
        if (vttFile) {
          const downloadUrl =
            vttFile['@microsoft.graph.downloadUrl'] ||
            `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${vttFile.id}/content`;
          const vttRes = await fetch(downloadUrl, { headers });
          if (vttRes.ok) return await vttRes.text();
        }
      }
    }
  } catch {
    // Fall through.
  }

  throw new Error('NO_TRANSCRIPT');
}
