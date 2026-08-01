/**
 * Helpers for class reference material.
 *
 * Pure functions only, so this module is safe to import from both the server
 * (the API route) and the client (the paste box, which classifies a URL the
 * instant it lands so the card can appear before the server answers).
 */
import { extractYouTubeId } from './youtube';
import type { NexusClassResourceKind } from '@neram/database';

/**
 * Columns every read of a resource returns. Keep the API and embeds in step.
 *
 * The nested `file` embed carries three things a study_file card cannot render
 * without: the read-only SharePoint address behind "Open in SharePoint", and the
 * name and type that decide whether this is a slide deck or a PDF. It is one
 * join on a foreign key that is already there, and it is null for every other
 * kind.
 */
export const RESOURCE_COLS =
  'id, kind, title, note, url, thumb_url, study_file_id, sort_order, created_at, ' +
  'file:nexus_study_files(file_name, file_type, sharepoint_web_url)';

/**
 * PostgREST embed for pulling a class's resources along with the class row.
 *
 * Used by the catch-up and recap payloads, which already load the class, so a
 * student on those screens costs no extra function invocation. Deliberately NOT
 * added to the weekly schedule payload: that is the most requested response in
 * the app and only carries the count.
 */
export const CLASS_RESOURCES_EMBED = `class_resources:nexus_class_resources(${RESOURCE_COLS})`;

/** Hard ceiling per class. Enforced server-side; the client copy is advisory. */
export const MAX_RESOURCES_PER_CLASS = 20;

/** System study folder that receives teacher-uploaded class reference PDFs. */
export const CLASS_RESOURCE_FOLDER_ID = 'a0000000-0000-4000-8000-000000000002';

export const MAX_TITLE_LENGTH = 200;
export const MAX_NOTE_LENGTH = 500;

/** The row shape the UI works with, narrower than the full DB row. */
export interface ClassResource {
  id: string;
  kind: NexusClassResourceKind;
  title: string;
  note: string | null;
  url: string | null;
  thumb_url: string | null;
  study_file_id: string | null;
  sort_order: number;
  created_at: string;
  /** Only on study_file rows. Null on videos, links and images. */
  file?: {
    file_name: string | null;
    file_type: string | null;
    /** Read-only, organisation-scoped. Safe to hand a student. */
    sharepoint_web_url: string | null;
  } | null;
}

/**
 * Is this a link we are willing to turn into an href?
 *
 * Allowlist rather than a blocklist: these strings are rendered as anchors and
 * pasted by a teacher, so `javascript:` and `data:` must never survive. Anything
 * that is not parseable as an absolute http(s) URL is rejected outright.
 */
export function isSafeHttpUrl(input: string | null | undefined): boolean {
  if (!input) return false;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/**
 * Is this a link to a file in our own SharePoint or OneDrive?
 *
 * These are not treated as plain links. A pasted SharePoint URL saved as a `link`
 * sends the student out of the app to a Microsoft sign-in they may not have, and
 * on a page where the file can often be edited. Routed through the study-file
 * pipeline instead, the same URL becomes a card that opens in the secure reader,
 * watermarked and read-only, which is the whole point of attaching it.
 */
export function isSharePointUrl(input: string | null | undefined): boolean {
  if (!isSafeHttpUrl(input)) return false;
  try {
    const host = new URL((input as string).trim()).hostname.toLowerCase();
    return (
      host.endsWith('.sharepoint.com') ||
      host === 'onedrive.live.com' ||
      host === '1drv.ms'
    );
  } catch {
    return false;
  }
}

/**
 * Classify a pasted string.
 *
 * Returns null when it is not something we can attach, which is what the paste
 * box uses to stay quiet while the teacher is still typing. A bare 11-char
 * YouTube id counts as a video (extractYouTubeId accepts it), so a teacher who
 * copies just the id from a share sheet still gets a video card.
 *
 * A SharePoint link answers `study_file`: it is resolved and stored as one, so
 * the card the teacher sees while typing matches the card they get after saving.
 */
export function detectResourceKind(input: string | null | undefined): NexusClassResourceKind | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  if (extractYouTubeId(raw)) return 'youtube';
  if (isSharePointUrl(raw)) return 'study_file';
  if (isSafeHttpUrl(raw)) return 'link';
  return null;
}

/**
 * Canonical watch URL for a video id.
 *
 * One form for every paste, so the same video shared as youtu.be, /shorts/ and a
 * full watch link does not become three different resources.
 */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Thumbnail for a video id.
 *
 * Deterministic, so it costs no request and works offline in tests. This is the
 * fallback whenever oEmbed is unavailable, and the instant placeholder the paste
 * box shows while the real title is still resolving.
 */
export function youtubeThumb(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * The hostname shown under a link's title, e.g. "khanacademy.org".
 *
 * Returns an empty string rather than throwing, because it renders inside a card
 * that must survive a malformed row.
 */
export function displayHost(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Display order: the teacher's arrangement first, then oldest to newest.
 *
 * The created_at tiebreak matters because reordering only rewrites sort_order
 * for the rows that moved, so ties are normal rather than exceptional.
 */
export function sortResources<T extends { sort_order: number; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at.localeCompare(b.created_at);
  });
}

/**
 * How many pieces of material a class carries, from the weekly payload.
 *
 * PostgREST returns an aggregate embed as `[{ count: n }]`, not a number, so
 * every reader would otherwise have to remember the array. Returns 0 for a class
 * loaded through a select that does not ask for the count.
 */
export function resourceCount(cls: { class_resources?: unknown } | null | undefined): number {
  const embed = (cls as any)?.class_resources;
  if (!Array.isArray(embed)) return 0;
  const first = embed[0];
  return typeof first?.count === 'number' ? first.count : 0;
}

/** Trim and cap a user-supplied string, returning null when nothing is left. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}
