import { describe, it, expect } from 'vitest';
import { hasOpenObligation, watchModeFor, mayWatchUngated } from './recap-obligation';

const OPEN = { caught_up_at: null, excused_at: null };
const DONE = { caught_up_at: '2026-08-02T10:00:00Z', excused_at: null };
const EXCUSED = { caught_up_at: null, excused_at: '2026-08-02T10:00:00Z' };

describe('hasOpenObligation', () => {
  it('is open when a row exists with neither stamp set', () => {
    expect(hasOpenObligation({ caught_up_at: null, excused_at: null })).toBe(true);
  });

  it('is closed once the student has caught up', () => {
    expect(hasOpenObligation({ caught_up_at: '2026-08-02T10:00:00Z', excused_at: null })).toBe(false);
  });

  it('is closed once a teacher has excused it', () => {
    expect(hasOpenObligation({ caught_up_at: null, excused_at: '2026-08-02T10:00:00Z' })).toBe(false);
  });

  // The attended case, and the one that decides the size of the "Watch again"
  // tab: a student who was in the room has no absence row at all.
  it('is closed when there is no row', () => {
    expect(hasOpenObligation(null)).toBe(false);
    expect(hasOpenObligation(undefined)).toBe(false);
  });
});

describe('watchModeFor', () => {
  it('gates a class the student still owes', () => {
    expect(watchModeFor({ caught_up_at: null, excused_at: null })).toBe('gated');
  });

  it('lets a finished class play as revision', () => {
    expect(watchModeFor({ caught_up_at: '2026-08-02T10:00:00Z', excused_at: null })).toBe('revision');
  });

  it('lets an excused class play as revision', () => {
    expect(watchModeFor({ caught_up_at: null, excused_at: '2026-08-02T10:00:00Z' })).toBe('revision');
  });

  it('lets a class the student attended play as revision', () => {
    expect(watchModeFor(null)).toBe('revision');
  });
});

describe('mayWatchUngated', () => {
  // The case the whole rule exists for. Watching here is recorded nowhere, so
  // allowing it means the student finishes the class and is then asked to watch
  // the identical ninety minutes again to clear the absence.
  it('refuses an owed class once a guided recap is published', () => {
    expect(mayWatchUngated(OPEN, true)).toBe(false);
  });

  // The catch-up screen falls back to this very route when no recap exists, and
  // credits that watch itself. Refusing here would leave no way through at all.
  it('allows an owed class while no recap has been published', () => {
    expect(mayWatchUngated(OPEN, false)).toBe(true);
  });

  it('allows rewatching once the student has caught up', () => {
    expect(mayWatchUngated(DONE, true)).toBe(true);
  });

  it('allows a class a teacher has excused', () => {
    expect(mayWatchUngated(EXCUSED, true)).toBe(true);
  });

  // No row means they were in the room. Treating a missing row as owed would
  // gate every class the student ever sat through.
  it('allows a class the student attended', () => {
    expect(mayWatchUngated(null, true)).toBe(true);
    expect(mayWatchUngated(undefined, true)).toBe(true);
  });
});
