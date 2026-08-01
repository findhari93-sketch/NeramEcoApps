/**
 * Where the checkpoints go.
 *
 * Segment boundaries used to be Gemini's job: it read the whole transcript and
 * proposed topic changes. That was the right instinct and the wrong trade. It
 * cost a call per recap before a single question existed, it returned a
 * different number of checkpoints for every class so a teacher could never
 * predict what students would get, and when it drifted the two hardest quality
 * checks (coverage and boundary sanity) were the ones that failed, which held
 * the whole recap over something arithmetic can guarantee.
 *
 * So the division is computed and only the questions are generated. A one hour
 * class becomes four fifteen-minute checkpoints, every time. Coverage is exactly
 * 1.0, gaps and overlaps are impossible by construction, and the freed call goes
 * to questions instead.
 *
 * The one thing arithmetic gets wrong is cutting somebody off mid-sentence, so
 * each interior boundary is allowed to slide up to ninety seconds to land in a
 * real silence. That is a presentation detail, not a structural one: it moves a
 * boundary, it can never drop or reorder one.
 *
 * Pure. No Supabase, no network, no clock.
 */

import type { TranscriptEntry } from '@neram/database';

export interface PlannedSegment {
  start: number;
  end: number;
}

/**
 * How far a boundary may slide to find a pause.
 *
 * Ninety seconds of a fifteen-minute segment is ten percent, which is enough to
 * clear a worked example without making "fifteen minutes" a lie.
 */
export const SNAP_WINDOW_SECONDS = 90;

/**
 * The shortest silence worth moving a boundary for.
 *
 * Without a floor, a transcript with no real pauses would snap to whichever cue
 * happened to sit at the far edge of the window, drifting the boundary by up to
 * ninety seconds for no reason at all.
 */
export const MIN_PAUSE_SECONDS = 0.75;

/**
 * The pause nearest to `ideal`, or `ideal` itself when there is no real pause.
 *
 * Returns the moment the tutor starts speaking again rather than the moment they
 * stopped, so the checkpoint interrupts the silence rather than the next thought.
 * Ties on gap length go to whichever candidate sits closest to the ideal.
 */
function snapToPause(
  transcript: TranscriptEntry[],
  ideal: number,
  window: number,
  floor: number,
): number {
  if (window <= 0 || transcript.length < 2) return ideal;

  const lo = ideal - window;
  const hi = ideal + window;

  let best = ideal;
  let bestGap = 0;

  // Scanned rather than binary-searched: a class transcript is a few hundred
  // cues and there are at most a dozen boundaries, so this is thousands of
  // comparisons, and a scan does not assume the cues arrived sorted.
  for (let k = 0; k < transcript.length - 1; k++) {
    const resume = transcript[k + 1].start;
    if (resume < lo || resume > hi) continue;
    // Never cross a boundary we already placed, or the segments would invert.
    if (resume <= floor) continue;

    const gap = resume - transcript[k].end;
    if (gap < MIN_PAUSE_SECONDS) continue;

    const better =
      gap > bestGap ||
      (gap === bestGap && Math.abs(resume - ideal) < Math.abs(best - ideal));
    if (better) {
      bestGap = gap;
      best = resume;
    }
  }

  return best;
}

/**
 * Divide a class into checkpoint segments of roughly `targetSeconds`.
 *
 * Always contiguous from 0 to the full duration, always at least two segments,
 * always in order.
 *
 * @param durationSeconds Falls back to the last transcript cue when unknown,
 *   which is the common case: `recording_duration_minutes` is NULL on every
 *   class Teams has synced so far.
 */
export function planSegments(
  transcript: TranscriptEntry[],
  durationSeconds: number,
  targetSeconds: number,
): PlannedSegment[] {
  const duration = Math.round(
    durationSeconds || (transcript.length ? transcript[transcript.length - 1].end : 0),
  );
  if (duration <= 0) return [];

  const target = Math.max(60, Math.round(targetSeconds || 900));

  // At least two. One segment is a test at the end of a video, not a set of
  // checkpoints, and it tells us nothing about whether the middle was watched.
  const count = Math.max(2, Math.round(duration / target));
  const even = duration / count;

  // On a class shorter than the target, `even` is small and a ninety second
  // slide could jump a boundary past its neighbour. The window shrinks to keep
  // every segment strictly positive.
  const window = Math.min(SNAP_WINDOW_SECONDS, Math.max(0, Math.floor(even / 2) - 1));

  const bounds: number[] = [0];
  for (let i = 1; i < count; i++) {
    bounds.push(snapToPause(transcript, i * even, window, bounds[bounds.length - 1]));
  }
  bounds.push(duration);

  const out: PlannedSegment[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    out.push({ start: Math.round(bounds[i]), end: Math.round(bounds[i + 1]) });
  }
  return out;
}

/** "0:00 to 15:00", for a segment the model declined to name. */
export function describeWindow(start: number, end: number): string {
  const clock = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  };
  return `${clock(start)} to ${clock(end)}`;
}
