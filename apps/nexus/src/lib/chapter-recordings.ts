/**
 * What state each of a chapter's recordings is in, said in words.
 *
 * The Class recordings dialog used to list cards for the languages that had a
 * recording and chips for the ones that did not, so a language with a card had
 * no chip. That is the whole reason "why don't I see the English tag" was asked:
 * English had a card, its header had scrolled out of view, and no other line on
 * the visible part of it named a language. buildLanguageRows returns EVERY
 * offered language whether or not it has a recording, so the answer is always on
 * screen.
 *
 * The states are worth separating because they need different actions and they
 * are easy to confuse:
 *
 *   Live               published, ready, has checkpoints. Finishing it unlocks
 *                      the chapter test.
 *   Live, open         published, ready, NO checkpoints. Watchable, ungated, and
 *                      it does not unlock the test. This is the state that used
 *                      to be impossible, which is why an un-transcribed
 *                      recording reached nobody.
 *   On hold            published but not ready, so a teacher believes it is out
 *                      and no student can see it. The trap worth an amber chip.
 *   Draft              not published. Students see nothing either way; the
 *                      difference is whether it can be published as it stands.
 *   Not added          no recording in this language at all.
 *
 * Pure TypeScript, no JSX and no next/* imports, so the dialog, the readiness
 * checklist and the tests all share one definition of "live".
 */

import type { TrackLanguageOption } from './track-languages';
import { extractYouTubeId } from './youtube';

/** A track as /api/study-materials/files/[id]/video-tracks returns it. */
export interface RecordingTrack {
  id: string;
  language: string;
  language_label: string;
  title: string;
  status: string;
  readiness: string;
  hold_reason: string | null;
  section_count: number;
  video_duration_seconds: number | null;
  video_source: string;
  /**
   * The video this track points at. Staff-only, and the reason it is returned at
   * all is that without it the dialog could show a teacher the state of a
   * recording but never which file it was.
   */
  recording_url: string | null;
  /**
   * The file's real name when Nexus could read it, NULL otherwise.
   *
   * describeRecordingUrl below is still the fallback and still handles every
   * track attached before this column existed. What it cannot do is name a
   * SharePoint list link, whose path ends in DispForm.aspx, or a share link,
   * whose path ends in an opaque token. Those are exactly the two shapes the
   * file picker produces, so the row that was meant to say which video it holds
   * read "DispForm.aspx" instead.
   */
  recording_file_name?: string | null;
}

/** MUI chip colours, kept to the ones the theme defines. */
export type StateColour = 'success' | 'warning' | 'default';

export interface TrackState {
  /** Chip text. Short, and never the only carrier of the state. */
  label: string;
  colour: StateColour;
  /** A student can see it right now. Mirrors isServable exactly. */
  live: boolean;
  /** Finishing it unlocks the chapter test. False for an open recording. */
  gates: boolean;
  /**
   * One sentence, given the language's own label so that a row read halfway
   * down a scrolled dialog still says which recording it is talking about.
   */
  detail: (label: string) => string;
}

export interface TrackRow {
  code: string;
  label: string;
  track: RecordingTrack | null;
  state: TrackState;
}

/**
 * Name the attached video in a way a teacher recognises.
 *
 * DERIVED, never stored, and that is the point: every recording attached before
 * this existed gets a name straight away, where a new column would have been
 * NULL for all of them and only ever filled in for files picked from the new
 * search. There is nothing to backfill and nothing to migrate.
 *
 * The shapes worth handling, in the order they turn up in practice:
 *   stream.aspx?id=/sites/X/Recordings/Ch3.mp4  the Stream player link, whose
 *                                               real file name is in the query
 *   .../Shared%20Documents/Ch3%20English.mp4    a plain path, percent-encoded
 *   youtu.be/abc123                             no file name exists at all
 *
 * Falls back to the host rather than to an empty string: "neramclasses.
 * sharepoint.com" is a poor label and still tells a teacher more than a blank.
 */
export function describeRecordingUrl(
  url: string | null | undefined,
  /** The stored file name, which beats anything that can be read out of a URL. */
  fileName?: string | null,
): string {
  const stored = (fileName || '').trim();
  if (stored) return stored;

  const raw = (url || '').trim();
  if (!raw) return 'No video attached';

  const youtubeId = extractYouTubeId(raw);
  if (youtubeId) return `YouTube video ${youtubeId}`;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Not a URL at all. Show it back rather than swallowing it, since a teacher
    // looking at their own typo is how they find it.
    return raw.length > 60 ? `${raw.slice(0, 57)}...` : raw;
  }

  // Stream and embed links carry the real path in a query parameter, so the
  // pathname alone would only ever say "stream.aspx".
  const fromQuery = parsed.searchParams.get('id') || parsed.searchParams.get('file');
  const path = fromQuery || parsed.pathname;

  const last = path.split('/').filter(Boolean).pop();
  if (!last) return parsed.hostname;

  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    /* a stray % is not a reason to show nothing */
  }

  // A share link ends in an opaque token, not a file name. The host is the more
  // honest answer than a random string presented as if it were a file.
  if (!name.includes('.')) return parsed.hostname;

  return name;
}

/**
 * Published AND ready, matching isServable in the query layer exactly.
 *
 * Testing status alone is the mistake worth guarding: a track held at readiness
 * 'pending' is published in the teacher's sense and invisible in the student's.
 * A null readiness is ready, because the column was added after the first tracks
 * were written and its absence means nothing was ever holding them back.
 */
function isLive(track: RecordingTrack): boolean {
  return track.status === 'published' && (track.readiness ?? 'ready') === 'ready';
}

export function describeTrackState(track: RecordingTrack | null): TrackState {
  if (!track) {
    return {
      label: 'Not added',
      colour: 'default',
      live: false,
      gates: false,
      detail: (l) => `No ${l} recording on this chapter yet.`,
    };
  }

  const checkpoints = track.section_count;

  /**
   * Held, not merely unpublished.
   *
   * Only a PUBLISHED track can be held: a fresh one is created at readiness
   * 'pending' and stays there until it is published, so treating every
   * non-ready value as a hold would put an amber chip on every draft ever
   * created. What deserves the amber is the state where a teacher has published
   * and no student can see it.
   */
  if (track.status === 'published' && (track.readiness ?? 'ready') !== 'ready') {
    const reason = track.hold_reason ? ` (${track.hold_reason})` : '';
    return {
      label: 'On hold',
      colour: 'warning',
      live: false,
      gates: false,
      detail: (l) => `The ${l} recording is published but held back${reason}, so students cannot see it.`,
    };
  }

  if (isLive(track)) {
    return checkpoints > 0
      ? {
          label: `Live, ${checkpoints} checkpoint${checkpoints === 1 ? '' : 's'}`,
          colour: 'success',
          live: true,
          gates: true,
          detail: (l) =>
            `Students can watch the ${l} recording, and finishing it unlocks the chapter test.`,
        }
      : {
          label: 'Live, open',
          colour: 'success',
          live: true,
          gates: false,
          detail: (l) =>
            `Students can watch the ${l} recording freely. It has no checkpoints, so it does not unlock the chapter test.`,
        };
  }

  return checkpoints > 0
    ? {
        label: `Draft, ${checkpoints} checkpoint${checkpoints === 1 ? '' : 's'}`,
        colour: 'default',
        live: false,
        gates: false,
        detail: (l) =>
          `The ${l} recording has its checkpoints and is ready to publish. Students see nothing until you do.`,
      }
    : {
        label: 'Draft, no checkpoints',
        colour: 'default',
        live: false,
        gates: false,
        detail: (l) =>
          `Upload the ${l} recording's transcript to create its checkpoints, or publish it as an open recording students can watch without one.`,
      };
}

/**
 * Every language this chapter could be in, in the order an admin arranged them,
 * with any language that has a recording but is no longer offered appended.
 *
 * That tail matters: removing a language from the offered list does not remove
 * the recording, and a recording students are watching that its own dialog
 * cannot show is exactly how one gets orphaned. It keeps the label stored on the
 * row, which is why that label is stored at all.
 */
export function buildLanguageRows(
  languages: TrackLanguageOption[],
  tracks: RecordingTrack[],
): TrackRow[] {
  const byLanguage = new Map<string, RecordingTrack>();
  for (const t of tracks) if (!byLanguage.has(t.language)) byLanguage.set(t.language, t);

  const rows: TrackRow[] = languages.map((l) => {
    const track = byLanguage.get(l.code) || null;
    return { code: l.code, label: l.label, track, state: describeTrackState(track) };
  });

  const offered = new Set(languages.map((l) => l.code));
  for (const t of tracks) {
    if (offered.has(t.language)) continue;
    offered.add(t.language);
    rows.push({
      code: t.language,
      // Bare code as the last resort: ugly, and far better than a blank row.
      label: t.language_label || t.language,
      track: t,
      state: describeTrackState(t),
    });
  }

  return rows;
}
