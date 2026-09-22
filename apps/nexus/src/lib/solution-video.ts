/**
 * What a pasted solution-video link is, and what gets stored.
 *
 * One reading for every writer (the paper's Videos mode, the question editor,
 * the bulk route and the PATCH route) and every reader (the student player),
 * so a link the editor shows as valid is a link the student can play.
 *
 * YouTube is reduced to one canonical watch URL: tracking parameters (`?si=`),
 * Shorts paths and stray spaces are exactly what the old player regex choked
 * on. SharePoint and OneDrive links are kept as pasted, since the player turns
 * them into a direct download itself.
 *
 * PURE: no React, no database.
 */

import { extractYouTubeId } from './youtube';
import { isSharePointUrl, youtubeThumb, youtubeWatchUrl } from './class-resources';

export type SolutionVideoLink =
  | { kind: 'empty' }
  | { kind: 'youtube'; id: string; url: string }
  | { kind: 'sharepoint'; url: string }
  | { kind: 'invalid' };

export const INVALID_VIDEO_MESSAGE = 'Not a YouTube or SharePoint link';

export function classifySolutionVideo(raw: string | null | undefined): SolutionVideoLink {
  const value = (raw ?? '').trim();
  if (!value) return { kind: 'empty' };

  const id = extractYouTubeId(value);
  if (id) return { kind: 'youtube', id, url: youtubeWatchUrl(id) };

  if (isSharePointUrl(value)) return { kind: 'sharepoint', url: value };

  return { kind: 'invalid' };
}

/** The value to store: canonical for YouTube, trimmed for SharePoint, null for blank. */
export function storedSolutionVideo(raw: string | null | undefined): string | null {
  const link = classifySolutionVideo(raw);
  if (link.kind === 'youtube' || link.kind === 'sharepoint') return link.url;
  if (link.kind === 'empty') return null;
  // Not ours to judge on a legacy path: keep what was sent, trimmed.
  return (raw ?? '').trim() || null;
}

/** Do two stored or pasted values point at the same video (or both at none)? */
export function sameSolutionVideo(a: string | null | undefined, b: string | null | undefined): boolean {
  return storedSolutionVideo(a) === storedSolutionVideo(b);
}

/** A small preview frame for a YouTube link, or null for anything else. */
export function solutionVideoThumb(raw: string | null | undefined): string | null {
  const link = classifySolutionVideo(raw);
  return link.kind === 'youtube' ? youtubeThumb(link.id) : null;
}

export { isSharePointUrl };
