import { describe, it, expect } from 'vitest';
import { isWatched, type ClassFacts } from './catchup-journey';

/**
 * Whether a student has watched the class they missed.
 *
 * Two ways to earn it, and the second one is the whole subject of this file.
 * Where a guided recap is published, finishing its checkpoints is the proof.
 * Where one is not, the screen offers "I have watched it" and the server writes
 * `recording_watched_at`, which is the only place that column is ever written
 * and it refuses to write it while a published recap exists.
 *
 * So a stamped `recording_watched_at` is a fact about the past: at the moment
 * the student pressed it, there was no recap to gate on. The screen even says so
 * out loud, "Watch the recording now and it will be here next time".
 *
 * Reading it as "not watched" the day a recap is finally published takes a green
 * tick away from someone who did what was asked, re-opens a class they had
 * finished, and makes a liar of the promise on the button.
 */

const CLASS = 'class-1';
const RECAP = 'recap-1';

function facts(over: Partial<ClassFacts> = {}): ClassFacts {
  return {
    recapByClass: new Map(),
    completedRecaps: new Set(),
    assignmentsByClass: new Map(),
    submitted: new Set(),
    testByClass: new Map(),
    ...over,
  };
}

const item = (over: Record<string, unknown> = {}) => ({
  scheduled_class_id: CLASS,
  recording_watched_at: null,
  ...over,
});

describe('isWatched', () => {
  it('is false with no recap and nothing declared', () => {
    expect(isWatched(item(), facts())).toBe(false);
  });

  it('accepts the declaration when the class has no published recap', () => {
    expect(isWatched(item({ recording_watched_at: '2026-08-01T07:45:00Z' }), facts())).toBe(true);
  });

  it('is earned by finishing the recap where one is published', () => {
    const f = facts({
      recapByClass: new Map([[CLASS, { id: RECAP }]]),
      completedRecaps: new Set([RECAP]),
    });
    expect(isWatched(item(), f)).toBe(true);
  });

  it('still asks for the recap from a student who never declared anything', () => {
    const f = facts({ recapByClass: new Map([[CLASS, { id: RECAP }]]) });
    expect(isWatched(item(), f)).toBe(false);
  });

  it('keeps a declaration made before the recap was published', () => {
    // Production, 2026-08-06: this class's recap was drafted on 1 Aug and
    // published five days later, hours after the student had watched the raw
    // recording and submitted the work. Publishing it un-ticked their watch step.
    const f = facts({ recapByClass: new Map([[CLASS, { id: RECAP }]]) });
    expect(isWatched(item({ recording_watched_at: '2026-08-01T07:45:00Z' }), f)).toBe(true);
  });
});
