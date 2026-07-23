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
