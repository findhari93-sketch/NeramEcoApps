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
