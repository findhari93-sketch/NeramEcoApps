/**
 * How far a student may play, and how fast. The one definition of it.
 *
 * This rule used to be written out four times: once in RecapPlayer, once in
 * RecapYouTubePlayer, once in the Focus Mode page and once, in a slightly
 * different dialect, on the module item page. Each copy was `sections.find((s)
 * => !s.passed)` followed by its own clamping, and they drifted. The YouTube
 * path spent a release running native controls with a clamp that only armed
 * after a failed retry, so its scrubber could be dragged straight past a
 * checkpoint; nobody noticed because the fix had been made in the other copy.
 *
 * Everything here is arithmetic on plain numbers. No DOM, no React, no fetch.
 * That is the point: the cases that are awkward to reach in a browser are the
 * cheap ones to test, and a player that gets its bounds from here cannot
 * disagree with a player that does the same.
 *
 * None of this is a security boundary. Anyone with devtools can call play() at
 * whatever rate they like. The real guarantees are server-side: the quiz route
 * decides whether a checkpoint is passed, and the byte proxy decides who gets
 * the file at all. This is what stops ordinary skipping by ordinary students.
 */

export type VideoGateMode =
  /** Checkpoints bind. The student owes the first one they have not passed. */
  | 'gated'
  /** Already completed. Checkpoints are still described, but none of them bind. */
  | 'revision'
  /** Library clips, solution videos. Watermarked and tracked, never gated. */
  | 'open';

export interface GateCheckpoint {
  id: string;
  /** Where this checkpoint's stretch of the recording ends. */
  endSeconds: number;
  passed: boolean;
}

export interface VideoGateInput {
  checkpoints: GateCheckpoint[];
  /** 0 until the player reports one. Never trusted to be finite. */
  duration: number;
  /** Highest point genuinely reached this session. */
  furthestSeconds: number;
  mode: VideoGateMode;
}

export interface VideoGate {
  /** Hard ceiling on the scrub track. 0 means "not known yet", not "locked". */
  unlockedUntil: number;
  /** Where a seek arriving by another route is snapped back to. */
  seekCeiling: number;
  /** The checkpoint whose quiz opens at the boundary. */
  activeCheckpointId: string | null;
  currentSegmentPassed: boolean;
  maxRate: number;
  allPassed: boolean;
}

/**
 * Kept just inside the file. A checkpoint whose end runs past the recording is
 * never reached, so without this the last quiz would simply never open: playback
 * would run out and stop. Happens whenever a recording is trimmed after its
 * checkpoints were built, and on any rounding at the tail.
 */
const TAIL_EPSILON_SECONDS = 0.5;

/** Before the owed checkpoint is passed. Turns a 45 minute class into 45 minutes. */
const OWED_RATE = 1;
/** Every checkpoint passed, but still the graded run. Matches the speed menu. */
const CLEARED_RATE = 1.5;
/** Revision and ungated clips, where speed is nobody's business but the student's. */
const FREE_RATE = 2;

/**
 * Nothing to earn: a library clip, a solution video, a recording a teacher is
 * reviewing. Constant rather than a call, because these callers have no
 * checkpoints and no duration to feed in, and the player falls back to the real
 * duration when unlockedUntil is 0.
 */
export const OPEN_GATE: VideoGate = {
  unlockedUntil: 0,
  seekCeiling: Number.POSITIVE_INFINITY,
  activeCheckpointId: null,
  currentSegmentPassed: true,
  maxRate: 2,
  allPassed: true,
};

/** A duration of NaN, Infinity or below zero means "not loaded", never "zero long". */
function knownDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isUsable(checkpoint: GateCheckpoint): boolean {
  return Number.isFinite(checkpoint.endSeconds) && checkpoint.endSeconds > 0;
}

export function computeGate(input: VideoGateInput): VideoGate {
  // furthestSeconds is deliberately not read. See seekCeiling below: capping it
  // at the boundary is the same as ignoring it, and ignoring it is harder to get
  // wrong later. It stays on the input type because callers have it to hand and
  // a future non-gated mode may want it.
  const { checkpoints, duration, mode } = input;
  const dur = knownDuration(duration);
  // A checkpoint with no usable end cannot bind anything. Dropping it beats
  // gating at zero, which would lock the student out of a video entirely
  // because one row was written badly.
  const usable = (checkpoints ?? []).filter(isUsable);

  const unbound = (allPassed: boolean, rate: number): VideoGate => ({
    unlockedUntil: dur,
    seekCeiling: dur > 0 ? dur : Number.POSITIVE_INFINITY,
    activeCheckpointId: null,
    currentSegmentPassed: true,
    maxRate: rate,
    allPassed,
  });

  if (mode !== 'gated') {
    return unbound(usable.every((c) => c.passed), FREE_RATE);
  }

  // The EARLIEST end still owed, not the first element still owed. Sections are
  // loaded `.order('sort_order')` and never by timestamp, so array order is only
  // time order for as long as sort_order agrees. When a teacher reorders
  // checkpoints, taking the first array element moves the boundary to a LATER
  // one and hands the student the whole stretch in between, unquizzed.
  let active: GateCheckpoint | null = null;
  for (const checkpoint of usable) {
    if (checkpoint.passed) continue;
    if (!active || checkpoint.endSeconds < active.endSeconds) active = checkpoint;
  }

  if (!active) return unbound(true, CLEARED_RATE);

  const unlockedUntil =
    dur > 0
      ? Math.min(active.endSeconds, Math.max(1, dur - TAIL_EPSILON_SECONDS))
      : active.endSeconds;

  return {
    unlockedUntil,
    // furthestSeconds deliberately does NOT appear here. It exists so a student
    // who reached 20:00 and jumped back to 5:00 can scrub forward again, which
    // is reasonable, but it must never become a way to bank a position past an
    // unpassed checkpoint and then seek to it. Capping it at the boundary is the
    // same as ignoring it, so it is ignored.
    seekCeiling: unlockedUntil > 0 ? unlockedUntil : Number.POSITIVE_INFINITY,
    activeCheckpointId: active.id,
    currentSegmentPassed: false,
    maxRate: OWED_RATE,
    allPassed: false,
  };
}
