/**
 * "Watch before class": a few videos a teacher attaches to a scheduled class
 * for students to watch before it starts.
 *
 * Two sources, one list:
 * - a Library video (library_videos, mostly older YouTube classes);
 * - the recording of a past Nexus class, from any classroom.
 *
 * Optional and never a gate. Tracked, so a student sees their own tick and the
 * teacher sees how many watched. Pure module: safe for the server and the client.
 *
 * Storage: rows on nexus_class_resources with kind library_video or
 * class_recording (20261116090000_nexus_class_prewatch.sql). Views live on
 * nexus_class_video_views, keyed by the video, so a video attached to a weekly
 * class is ticked once for every week.
 */
import type { PrewatchKind } from './class-resources';

export type { PrewatchKind } from './class-resources';

/** Most videos one class can ask students to watch. More than this is homework. */
export const PREWATCH_MAX = 5;

/**
 * Share of the video that must actually PLAY for it to count as watched.
 *
 * Lower than the 90 percent the catch-up gate uses on purpose: this is optional
 * and ungraded, and students reasonably skip an intro or a sign-off. Measured on
 * real playback (watched_seconds), never on how far the scrubber was dragged.
 * The SQL in nexus_bump_class_video_view uses the same 0.8; change both.
 */
export const PREWATCH_COMPLETE_RATIO = 0.8;

/** Below this much real playback a student has not really started. */
export const PREWATCH_STARTED_SECONDS = 30;

export type PrewatchState = 'not_started' | 'started' | 'watched';

/** What the teacher picked: a Library video id, or a past class id. */
export interface PrewatchPick {
  kind: PrewatchKind;
  id: string;
}

/** Stable identity of a video across both sources, e.g. `library_video:<uuid>`. */
export function pickKey(pick: { kind: string; id: string }): string {
  return `${pick.kind}:${pick.id}`;
}

/** The pick a stored attachment row stands for, or null for any other kind. */
export function pickOfRow(row: {
  kind: string;
  library_video_id?: string | null;
  source_class_id?: string | null;
}): PrewatchPick | null {
  if (row.kind === 'library_video' && row.library_video_id) return { kind: 'library_video', id: row.library_video_id };
  if (row.kind === 'class_recording' && row.source_class_id) return { kind: 'class_recording', id: row.source_class_id };
  return null;
}

/**
 * Clean a client-sent pick list: known kinds only, no duplicates, capped.
 * Returns null when the input is not a list at all, so a caller can tell
 * "nothing sent" from "an empty list".
 */
export function normalizePicks(input: unknown): PrewatchPick[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: PrewatchPick[] = [];
  for (const raw of input) {
    const kind = (raw as any)?.kind;
    const id = typeof (raw as any)?.id === 'string' ? (raw as any).id.trim() : '';
    if ((kind !== 'library_video' && kind !== 'class_recording') || !id) continue;
    const pick = { kind, id } as PrewatchPick;
    const key = pickKey(pick);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pick);
  }
  return out;
}

/** One student's progress on one video, as nexus_class_video_views stores it. */
export interface PrewatchView {
  watched_seconds: number | null;
  completed_at: string | null;
}

/**
 * Where a student is with one video.
 *
 * `completed_at` wins: once watched, always watched, even if the length on
 * record changes later. Without it, 80 percent of the known length counts, so a
 * row written before the length was known still reads correctly.
 */
export function prewatchState(view: PrewatchView | null | undefined, durationSeconds?: number | null): PrewatchState {
  if (!view) return 'not_started';
  if (view.completed_at) return 'watched';
  const watched = Math.max(0, view.watched_seconds || 0);
  if (durationSeconds && durationSeconds > 0 && watched >= PREWATCH_COMPLETE_RATIO * durationSeconds) return 'watched';
  if (watched >= PREWATCH_STARTED_SECONDS) return 'started';
  return 'not_started';
}

/** "45 sec", "12 min", "1 hr 5 min". Empty for an unknown length. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "12 Oct 2026" from a class's `YYYY-MM-DD`.
 *
 * Parsed by hand, never through Date: a date-only string becomes UTC midnight,
 * and formatting that in a browser west of UTC shows the day before.
 */
export function formatClassDate(isoDate: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return '';
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** The title a Library video goes by: the reviewed one first. */
export function libraryTitle(v: {
  approved_title?: string | null;
  suggested_title?: string | null;
  original_title?: string | null;
}): string {
  return (v.approved_title || v.suggested_title || v.original_title || 'Library video').trim();
}

/**
 * One attached video as a student or teacher sees it.
 *
 * `state` is the viewer's own progress (students only). `summary` is the class
 * roll-up (staff only).
 */
export interface PrewatchItem {
  /** The attachment row id: what the watch page and the play route are keyed on. */
  id: string;
  kind: PrewatchKind;
  title: string;
  note: string | null;
  thumb_url: string | null;
  duration_seconds: number | null;
  library_video_id: string | null;
  source_class_id: string | null;
  /** "Library", or "JEE B.Arch Session 1, 3 Oct 2026" for a past class. */
  source_label: string | null;
  sort_order: number;
  state?: PrewatchState;
  summary?: { watched: number; started: number; total: number };
}
