/**
 * Fetch a Teams/SharePoint recording transcript (VTT) via Microsoft Graph.
 *
 * Extracted from api/modules/.../auto-generate so the class-recap generator can
 * reuse the exact resolution chain: sharing URL -> driveItem -> a sibling ".vtt"
 * file in the same folder.
 *
 * It used to try the beta `media/transcripts` endpoint on the recording's
 * driveItem first. That endpoint is gone: probed against production on
 * 2026-07-30 it answers `400 invalidRequest: Unsupported segment type.
 * ODataQuery: transcripts` in BOTH URL shapes, the /sites/{siteId}/drives form
 * and the plain /drives form. Removed rather than left in, because a step that
 * always 400s made this function always throw NO_TRANSCRIPT, and that sentinel
 * became the message every teacher saw ("Teams has not published a transcript
 * for this class yet") while the transcript sat readable on the Teams artifact
 * API the whole time. Do not add it back without a fresh probe.
 *
 * What remains is a genuine long shot: Teams does not export a .vtt next to the
 * .mp4, so this only finds a transcript somebody put there by hand. It stays
 * because it is a single call and lib/transcript-resolver runs it last.
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

  if (!driveId || !itemId) {
    throw new Error('Could not resolve drive item from sharing URL');
  }

  // Step 2: a ".vtt" sibling file in the same folder.
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
