/**
 * Helpers for the unlisted-YouTube backup copies of class recordings.
 * We only ever store/serve the 11-char video id, so malformed pastes,
 * tracking params, and playlist noise are stripped.
 */

/** Extract the 11-char video id from any common YouTube URL (or a bare id). */
export function extractYouTubeId(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // Already a bare id.
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    // /watch?v=ID
    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    // /embed/ID, /shorts/ID, /live/ID
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => ['embed', 'shorts', 'live', 'v'].includes(p));
    if (idx >= 0 && parts[idx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[idx + 1])) {
      return parts[idx + 1];
    }
  }
  return null;
}

/** True when the string looks like a valid YouTube link we can serve. */
export function isValidYouTubeUrl(input: string | null | undefined): boolean {
  return extractYouTubeId(input) !== null;
}
