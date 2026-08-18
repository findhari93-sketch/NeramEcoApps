import { describe, it, expect } from 'vitest';
import { resolveExamTimer } from './exam-timer';

/**
 * resolveExamTimer is the one place inherit/untimed/timed gets decided, so
 * the take page's countdown, attemptIsStale and the invigilation roster can
 * never disagree. These pin every combination its three callers depend on.
 */

describe('resolveExamTimer: inherit (default, and every pre-existing exam)', () => {
  it('a null exam (no exam context at all) returns the paper unchanged', () => {
    expect(resolveExamTimer(null, { test_type: 'timed', duration_minutes: 45 })).toEqual({
      test_type: 'timed',
      duration_minutes: 45,
    });
    expect(resolveExamTimer(undefined, { test_type: 'untimed', duration_minutes: null })).toEqual({
      test_type: 'untimed',
      duration_minutes: null,
    });
  });

  it('an exam with no timer_mode at all (a pre-existing row) also inherits the paper', () => {
    expect(
      resolveExamTimer({ duration_minutes: 999 }, { test_type: 'timed', duration_minutes: 45 }),
    ).toEqual({ test_type: 'timed', duration_minutes: 45 });
  });

  it('an explicit "inherit" mode returns the paper unchanged, timed paper case', () => {
    expect(
      resolveExamTimer(
        { timer_mode: 'inherit', duration_minutes: 999 },
        { test_type: 'timed', duration_minutes: 45 },
      ),
    ).toEqual({ test_type: 'timed', duration_minutes: 45 });
  });

  it('an explicit "inherit" mode returns the paper unchanged, untimed paper case', () => {
    expect(
      resolveExamTimer({ timer_mode: 'inherit' }, { test_type: 'untimed', duration_minutes: null }),
    ).toEqual({ test_type: 'untimed', duration_minutes: null });
  });

  it('a paper with no test_type at all falls back to untimed, matching every other reader in this codebase', () => {
    expect(resolveExamTimer(null, {})).toEqual({ test_type: 'untimed', duration_minutes: null });
  });
});

describe('resolveExamTimer: untimed always wins', () => {
  it('overrides a timed paper to no countdown', () => {
    expect(
      resolveExamTimer(
        { timer_mode: 'untimed', duration_minutes: 999 },
        { test_type: 'timed', duration_minutes: 45 },
      ),
    ).toEqual({ test_type: 'untimed', duration_minutes: null });
  });

  it('drops any stale duration_minutes still sitting on the exam row', () => {
    expect(
      resolveExamTimer({ timer_mode: 'untimed', duration_minutes: 60 }, { test_type: 'untimed' }),
    ).toEqual({ test_type: 'untimed', duration_minutes: null });
  });
});

describe('resolveExamTimer: timed always uses the exam\'s own duration', () => {
  it('overrides an untimed paper into a real countdown', () => {
    expect(
      resolveExamTimer(
        { timer_mode: 'timed', duration_minutes: 30 },
        { test_type: 'untimed', duration_minutes: null },
      ),
    ).toEqual({ test_type: 'timed', duration_minutes: 30 });
  });

  it('ignores the paper\'s own duration entirely, even when the paper is also timed', () => {
    expect(
      resolveExamTimer(
        { timer_mode: 'timed', duration_minutes: 90 },
        { test_type: 'timed', duration_minutes: 45 },
      ),
    ).toEqual({ test_type: 'timed', duration_minutes: 90 });
  });

  it('a defensive corner case: timed with no duration on the exam stays safely "no countdown"', () => {
    expect(
      resolveExamTimer({ timer_mode: 'timed', duration_minutes: null }, { test_type: 'timed', duration_minutes: 45 }),
    ).toEqual({ test_type: 'timed', duration_minutes: null });
  });
});
