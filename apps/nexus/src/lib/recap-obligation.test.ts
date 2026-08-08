import { describe, it, expect } from 'vitest';
import { hasOpenObligation, watchModeFor } from './recap-obligation';

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
