import { describe, it, expect } from 'vitest';
import { computeGate, QUIZ_WATCH_RATIO, type GateCheckpoint } from './video-gate';

/**
 * The rules a student's playback is bound by, tested without a DOM.
 *
 * These used to live inside two player components and be re-derived in two
 * pages, which is how the YouTube path spent a release with a scrubber that
 * could be dragged past a checkpoint. Everything here is arithmetic, so the
 * cases that are awkward to reach in a browser (a checkpoint that ends past the
 * file, a duration that has not loaded, a banked position beyond the boundary)
 * are the cheap ones to pin down.
 */

/** Three 15 minute checkpoints, the shape the segment planner actually emits. */
function cps(passed: [boolean, boolean, boolean]): GateCheckpoint[] {
  return [
    { id: 'a', endSeconds: 900, passed: passed[0] },
    { id: 'b', endSeconds: 1800, passed: passed[1] },
    { id: 'c', endSeconds: 2700, passed: passed[2] },
  ];
}

const DURATION = 2700;

function gated(checkpoints: GateCheckpoint[], duration = DURATION, furthestSeconds = 0) {
  return computeGate({ checkpoints, duration, furthestSeconds, mode: 'gated' });
}

describe('computeGate: the boundary is the checkpoint the student owes', () => {
  it('stops at the end of the first checkpoint when nothing is passed', () => {
    const gate = gated(cps([false, false, false]));
    expect(gate.unlockedUntil).toBe(900);
    expect(gate.activeCheckpointId).toBe('a');
    expect(gate.allPassed).toBe(false);
  });

  it('moves to the next checkpoint once one is passed', () => {
    expect(gated(cps([true, false, false])).unlockedUntil).toBe(1800);
    // The last checkpoint ends exactly at the duration, so it is pulled just
    // inside the file. Left at 2700 the boundary is never reached and the final
    // quiz never opens: playback runs out and stops instead.
    expect(gated(cps([true, true, false])).unlockedUntil).toBe(2699.5);
  });

  it('opens the whole recording once every checkpoint is passed', () => {
    const gate = gated(cps([true, true, true]));
    expect(gate.unlockedUntil).toBe(DURATION);
    expect(gate.activeCheckpointId).toBeNull();
    expect(gate.allPassed).toBe(true);
  });

  it('does not gate a video that has no checkpoints', () => {
    const gate = gated([]);
    expect(gate.unlockedUntil).toBe(DURATION);
    expect(gate.allPassed).toBe(true);
  });
});

describe('computeGate: ordering cannot open a window over an unpassed checkpoint', () => {
  /**
   * The reason this module picks the earliest end rather than the first array
   * element. Sections are loaded `.order('sort_order')` and never by timestamp,
   * so sort_order is the only thing keeping array order and time order in step.
   * Both players used `sections.find((s) => !s.passed)`, so the moment a teacher
   * reordered checkpoints the boundary jumped to a LATER one and the stretch in
   * between could be scrubbed through without ever answering its quiz.
   */
  it('takes the earliest unpassed end when array order disagrees with time', () => {
    const scrambled: GateCheckpoint[] = [
      { id: 'a', endSeconds: 900, passed: true },
      { id: 'c', endSeconds: 2700, passed: false },
      { id: 'b', endSeconds: 1800, passed: false },
    ];
    const gate = gated(scrambled);
    expect(gate.unlockedUntil).toBe(1800);
    expect(gate.activeCheckpointId).toBe('b');
  });

  it('holds at the earliest gap when a later checkpoint was passed out of order', () => {
    const gate = gated(cps([true, false, true]));
    expect(gate.unlockedUntil).toBe(1800);
    expect(gate.activeCheckpointId).toBe('b');
    expect(gate.allPassed).toBe(false);
  });
});

describe('computeGate: a checkpoint that ends past the file still fires', () => {
  /**
   * Happens whenever a recording is trimmed after its checkpoints were built.
   * Left unclamped the boundary is never reached, so playback runs out and the
   * last quiz simply never opens.
   */
  it('clamps the boundary just inside the recording', () => {
    const gate = gated([{ id: 'a', endSeconds: 9999, passed: false }], 600);
    expect(gate.unlockedUntil).toBe(599.5);
  });

  it('never clamps below one second, so the track is always usable', () => {
    const gate = gated([{ id: 'a', endSeconds: 9999, passed: false }], 0.2);
    expect(gate.unlockedUntil).toBe(1);
  });
});

describe('computeGate: a duration that has not loaded yet', () => {
  it('uses the raw checkpoint end before metadata arrives', () => {
    expect(gated(cps([false, false, false]), 0).unlockedUntil).toBe(900);
  });

  it('treats NaN and Infinity as "not known yet" rather than as a ceiling', () => {
    expect(gated(cps([false, false, false]), NaN).unlockedUntil).toBe(900);
    expect(gated(cps([false, false, false]), Infinity).unlockedUntil).toBe(900);
  });

  it('reports no ceiling when everything is passed but the duration is unknown', () => {
    expect(gated(cps([true, true, true]), 0).unlockedUntil).toBe(0);
  });
});

describe('computeGate: a banked position can never raise the ceiling', () => {
  /**
   * furthestSeconds exists so a student who reached 20:00 and jumped back to
   * 5:00 can scrub forward again. It must not become a way to bank a position
   * past an unpassed checkpoint and then seek to it.
   */
  it('ignores a furthest position beyond the boundary', () => {
    const gate = gated(cps([false, false, false]), DURATION, 2600);
    expect(gate.unlockedUntil).toBe(900);
    expect(gate.seekCeiling).toBe(900);
  });

  it('lets a furthest position inside the boundary stand', () => {
    expect(gated(cps([true, false, false]), DURATION, 1200).seekCeiling).toBe(1800);
  });

  it('is not moved by a negative or nonsense furthest position', () => {
    expect(gated(cps([false, false, false]), DURATION, -50).seekCeiling).toBe(900);
    expect(gated(cps([false, false, false]), DURATION, NaN).seekCeiling).toBe(900);
  });
});

describe('computeGate: the owed section is free, its quiz waits on watching (NXS-0130)', () => {
  /**
   * A student watched 11 seconds, tapped the bar, and was dropped exactly on
   * checkpoint 1, and the quiz opened over a black frame. The first fix held
   * forward seeks at the played point, which left a first-time viewer with a
   * bar that would not move at all. Now the section is theirs to drag through,
   * and what a drag cannot buy is the quiz: it opens once most of the section
   * has really been played.
   */
  function withPlayed(checkpoints: GateCheckpoint[], playedRanges: Array<[number, number]> | undefined) {
    return computeGate({
      checkpoints,
      duration: DURATION,
      furthestSeconds: 0,
      playedRanges,
      mode: 'gated',
    });
  }

  it('lets a student drag anywhere up to the checkpoint they owe', () => {
    const gate = withPlayed(cps([false, false, false]), [[0, 11]]);
    expect(gate.seekCeiling).toBe(900);
    expect(gate.unlockedUntil).toBe(900);
  });

  it('holds the quiz until most of the section has been played', () => {
    const gate = withPlayed(cps([false, false, false]), [[0, 11]]);
    expect(gate.quizReady).toBe(false);
    expect(gate.owedWatch).toMatchObject({ sectionStart: 0, sectionEnd: 900, watchedSeconds: 11 });
    expect(gate.owedWatch!.requiredSeconds).toBeCloseTo(900 * QUIZ_WATCH_RATIO);
    expect(gate.owedWatch!.nextUnwatchedAt).toBe(11);
  });

  it('opens the quiz once enough of the section is covered, in pieces or not', () => {
    expect(withPlayed(cps([false, false, false]), [[0, 900]]).quizReady).toBe(true);
    // Two stretches with a skipped middle, still over 80%.
    expect(withPlayed(cps([false, false, false]), [[0, 400], [500, 900]]).quizReady).toBe(true);
    // Watching only the last bit after a drag is not enough.
    expect(withPlayed(cps([false, false, false]), [[700, 900]]).quizReady).toBe(false);
  });

  it('counts only the owed section, not passed ones before it', () => {
    // Section 1 fully watched, section 2 barely: the quiz for 2 waits.
    const gate = withPlayed(cps([true, false, false]), [[0, 1000]]);
    expect(gate.owedWatch).toMatchObject({ sectionStart: 900, sectionEnd: 1800, watchedSeconds: 100 });
    expect(gate.quizReady).toBe(false);
    expect(gate.owedWatch!.nextUnwatchedAt).toBe(1000);
  });

  it('keeps the old quiz-on-arrival for a caller that does not track played ranges', () => {
    const gate = withPlayed(cps([false, false, false]), undefined);
    expect(gate.quizReady).toBe(true);
    expect(gate.owedWatch).toBeNull();
    expect(gate.seekCeiling).toBe(900);
  });

  it('takes the section start from time order, not array order', () => {
    const scrambled: GateCheckpoint[] = [
      { id: 'c', endSeconds: 2700, passed: false },
      { id: 'a', endSeconds: 900, passed: true },
      { id: 'b', endSeconds: 1800, passed: true },
    ];
    const gate = withPlayed(scrambled, []);
    expect(gate.owedWatch!.sectionStart).toBe(1800);
  });

  it('does not ask anyone to watch a stretch that was never made a checkpoint', () => {
    // A 13 minute pre-class wait with no teaching in it: the generator drops it
    // (or a teacher removes it), so the first checkpoint starts at 13:06.
    const firstStartsLate: GateCheckpoint[] = [
      { id: 'a', startSeconds: 786, endSeconds: 1643, passed: false },
      { id: 'b', startSeconds: 1643, endSeconds: 2443, passed: false },
    ];
    const gate = withPlayed(firstStartsLate, [[786, 1643]]);
    expect(gate.owedWatch!.sectionStart).toBe(786);
    expect(gate.quizReady).toBe(true);
  });

  it('ignores a start that makes no sense rather than shrinking the section', () => {
    const odd: GateCheckpoint[] = [{ id: 'a', startSeconds: 5000, endSeconds: 900, passed: false }];
    expect(withPlayed(odd, []).owedWatch!.sectionStart).toBe(0);
    const nan: GateCheckpoint[] = [{ id: 'a', startSeconds: Number.NaN, endSeconds: 900, passed: false }];
    expect(withPlayed(nan, []).owedWatch!.sectionStart).toBe(0);
  });

  it('does not bind a revision watch or a fully passed one', () => {
    const revision = computeGate({
      checkpoints: cps([false, false, false]),
      duration: DURATION,
      furthestSeconds: 0,
      playedRanges: [[0, 10]],
      mode: 'revision',
    });
    expect(revision.seekCeiling).toBe(DURATION);
    expect(revision.quizReady).toBe(true);
    expect(withPlayed(cps([true, true, true]), [[0, 10]]).seekCeiling).toBe(DURATION);
  });
});

describe('computeGate: playback speed', () => {
  it('holds at 1x while a checkpoint is owed', () => {
    const gate = gated(cps([true, false, false]));
    expect(gate.maxRate).toBe(1);
    expect(gate.currentSegmentPassed).toBe(false);
  });

  it('allows faster revision once every checkpoint is passed', () => {
    const gate = gated(cps([true, true, true]));
    expect(gate.maxRate).toBeGreaterThan(1);
    expect(gate.currentSegmentPassed).toBe(true);
  });
});

describe('computeGate: revision mode', () => {
  /**
   * A chapter the student has already completed. The checkpoints are still
   * described so the list can be rendered, but none of them bind.
   */
  it('opens the whole recording even with checkpoints unpassed', () => {
    const gate = computeGate({
      checkpoints: cps([false, false, false]),
      duration: DURATION,
      furthestSeconds: 0,
      mode: 'revision',
    });
    expect(gate.unlockedUntil).toBe(DURATION);
    expect(gate.seekCeiling).toBe(DURATION);
    expect(gate.activeCheckpointId).toBeNull();
    expect(gate.maxRate).toBeGreaterThan(1);
  });

  /**
   * The trap that comes with using this mode for a student who was IN the class
   * rather than one who has completed it.
   *
   * `unlockedUntil` equals the duration here, so NeramVideoPlayer treats the end
   * of the recording as a boundary and raises onCheckpointReached, then raises
   * it again on `ended`. An attendee has passed nothing, so the "next owed"
   * index is 0 rather than -1, and a caller that opens a quiz on that signal
   * would throw checkpoint 1 at someone who just finished watching. Both
   * RecapPlayer and the Focus Mode page therefore refuse to act on a boundary
   * outside gated mode. This pins the property that makes that guard necessary.
   */
  it('names no active checkpoint even when none have been passed', () => {
    const gate = computeGate({
      checkpoints: cps([false, false, false]),
      duration: DURATION,
      furthestSeconds: 0,
      mode: 'revision',
    });
    expect(gate.activeCheckpointId).toBeNull();
    expect(gate.unlockedUntil).toBe(DURATION);
    expect(gate.currentSegmentPassed).toBe(true);
  });
});

describe('computeGate: open mode', () => {
  /**
   * Library videos and solution clips. They still go through this player for
   * watermarking and telemetry, but nothing about them is gated.
   */
  it('never binds, and does not invent a ceiling when the duration is unknown', () => {
    const gate = computeGate({
      checkpoints: [],
      duration: 0,
      furthestSeconds: 0,
      mode: 'open',
    });
    expect(gate.unlockedUntil).toBe(0);
    expect(gate.seekCeiling).toBe(Number.POSITIVE_INFINITY);
    expect(gate.currentSegmentPassed).toBe(true);
    expect(gate.maxRate).toBeGreaterThan(1);
  });
});

describe('computeGate: hostile input', () => {
  it('ignores checkpoints with an unusable end rather than gating at zero', () => {
    const gate = gated([
      { id: 'bad', endSeconds: Number.NaN, passed: false },
      { id: 'good', endSeconds: 900, passed: false },
    ]);
    expect(gate.unlockedUntil).toBe(900);
    expect(gate.activeCheckpointId).toBe('good');
  });

  it('treats a video whose checkpoints are all unusable as ungated', () => {
    const gate = gated([{ id: 'bad', endSeconds: Number.NaN, passed: false }]);
    expect(gate.unlockedUntil).toBe(DURATION);
    expect(gate.allPassed).toBe(true);
  });
});
