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
 * What remains only finds a .vtt somebody put next to the .mp4 by hand, because
 * Teams does not export one there. That used to make it a long shot kept alive
 * on the grounds that it is a single call. It is now a supported workflow: a
 * teacher downloads the transcript from Stream once, drops it beside the video
 * in the class-videos tree, and "Try fetching it" answers without an upload. See
 * pickSiblingVtt for the rule that makes a folder holding two languages safe.
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

/** Everything before the last dot. "Ch1 History en.mp4" -> "Ch1 History en". */
function baseName(name: string): string {
  const cut = name.lastIndexOf('.');
  return (cut > 0 ? name.slice(0, cut) : name).toLowerCase();
}

/**
 * Which `.vtt` in this folder belongs to THIS video.
 *
 * It used to be `.find(endsWith('.vtt'))`, the first one in whatever order Graph
 * returned. That was harmless while a folder held one recording and is wrong the
 * moment it holds a chapter's English and Tamil videos side by side, which is
 * exactly the layout Nexus now asks teachers to use so that this lookup works at
 * all: the Tamil track would be handed the English transcript, its checkpoints
 * would be cut from the wrong audio, and every timestamp would land in the middle
 * of nothing. Nothing would report a failure, because a transcript WAS found.
 *
 * Matching on the base name first fixes that. The old behaviour survives as the
 * fallback, so a folder with one video and a differently-named transcript keeps
 * working exactly as it did.
 */
export interface SiblingVtt {
  id?: string;
  name: string;
  /** Graph's short-lived pre-authenticated URL, when the listing carried one. */
  '@microsoft.graph.downloadUrl'?: string;
}

export function pickSiblingVtt(
  children: unknown,
  videoName: string | undefined,
): SiblingVtt | null {
  if (!Array.isArray(children)) return null;

  const vtts = (children as SiblingVtt[]).filter(
    (f) => typeof f?.name === 'string' && f.name.toLowerCase().endsWith('.vtt'),
  );
  if (!vtts.length) return null;

  if (videoName) {
    const stem = baseName(videoName);
    const exact = vtts.find((f) => baseName(f.name) === stem);
    if (exact) return exact;
  }

  // One transcript and no name match is not ambiguous, so take it. Several with
  // no match IS ambiguous, and guessing there is how the wrong one gets used;
  // the teacher uploads it by hand instead, which is the primary path anyway.
  return vtts.length === 1 ? vtts[0] : null;
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
        const vttFile = pickSiblingVtt(childrenData.value, driveItem.name);
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
