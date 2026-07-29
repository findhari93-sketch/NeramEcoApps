import { extractYouTubeId, isValidYouTubeUrl } from './youtube';

/**
 * The two recording links a class can carry, validated once.
 *
 * Teams keeps its copy for about six months and then it is gone, so the durable
 * record is an unlisted YouTube upload. Both live on the class; the YouTube one
 * is stored canonically (watch?v=ID) so the player and the validator agree.
 *
 * Extracted from the Class Day route so the timetable's wrap-up writes the same
 * links the same way. Two validators for one pair of columns is how one of them
 * ends up accepting a share link the player cannot open.
 */

export interface ClassLinkPatch {
  recording_url?: string | null;
  youtube_url?: string | null;
}

export interface ClassLinkResult {
  ok: boolean;
  error: string | null;
  patch: ClassLinkPatch;
}

/**
 * Build the patch for whichever links were supplied. A key that is absent is
 * left alone; a key present but empty clears the link.
 */
export function buildClassLinkPatch(body: {
  recording_url?: unknown;
  youtube_url?: unknown;
}): ClassLinkResult {
  const patch: ClassLinkPatch = {};

  if (body.recording_url !== undefined) {
    const url = body.recording_url ? String(body.recording_url).trim() : '';
    if (url && !/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'The recording link must start with http or https.', patch: {} };
    }
    if (url && isGraphApiUrl(url)) {
      return {
        ok: false,
        error:
          'That is a Microsoft Graph API address, not a link anyone can open. It needs an access token, so it plays for nobody. Use the SharePoint or OneDrive link to the recording file instead.',
        patch: {},
      };
    }
    patch.recording_url = url || null;
  }

  if (body.youtube_url !== undefined) {
    const raw = body.youtube_url ? String(body.youtube_url).trim() : '';
    if (raw && !isValidYouTubeUrl(raw)) {
      return {
        ok: false,
        error: 'That does not look like a YouTube link. Paste a youtube.com or youtu.be URL.',
        patch: {},
      };
    }
    const id = raw ? extractYouTubeId(raw) : null;
    patch.youtube_url = id ? `https://www.youtube.com/watch?v=${id}` : null;
  }

  return { ok: true, error: null, patch };
}

/**
 * A Microsoft Graph address masquerading as a recording link.
 *
 * `/onlineMeetings/{id}/recordings/{id}/content` is a real Graph endpoint, but it
 * resolves only when called with a bearer token, and recording_url is rendered
 * straight into an href and fed to getSharePointStreamUrl. Storing one is how
 * every "Watch Recording" button came to answer `InvalidAuthenticationToken:
 * Access token is empty`, so it is rejected at every write path rather than
 * discovered by a student.
 */
export function isGraphApiUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === 'graph.microsoft.com';
  } catch {
    return false;
  }
}
