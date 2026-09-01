import { describe, it, expect } from 'vitest';
import { summariseAttempt, formatBreakdown } from './attempt-breakdown';

/**
 * Fixtures follow the real shape from getStudentTestAttemptReview: `selected`
 * is whatever the student posted, `is_gradable` is false only for a drawing
 * a human marks after submission.
 */
const q = (selected: unknown, is_correct: boolean | null, is_gradable: boolean | null = true) => ({
  selected,
  is_correct,
  is_gradable,
});

describe('summariseAttempt', () => {
  it('separates wrong answers from questions never reached', () => {
    const b = summariseAttempt([q('A', true), q('B', false), q(null, false), q(null, false)]);
    expect(b.correct).toBe(1);
    expect(b.wrong).toBe(1);
    expect(b.skipped).toBe(2);
    expect(b.gradable).toBe(4);
  });

  /**
   * The distinction the whole module exists for. Both attempts score 1 of 4,
   * and they are not the same event: one student answered everything and got
   * three wrong, the other stopped after two questions.
   */
  it('tells apart two attempts with an identical score', () => {
    const knewNothing = summariseAttempt([q('A', true), q('B', false), q('C', false), q('D', false)]);
    const ranOutOfTime = summariseAttempt([q('A', true), q('B', false), q(null, false), q(null, false)]);

    expect(knewNothing.correct).toBe(ranOutOfTime.correct);
    expect(knewNothing.skipped).toBe(0);
    expect(ranOutOfTime.skipped).toBe(2);
  });

  it('counts an empty string as never answered, not as wrong', () => {
    const b = summariseAttempt([q('', false), q('   ', false)]);
    expect(b.skipped).toBe(2);
    expect(b.wrong).toBe(0);
  });

  it('counts an empty array as never answered', () => {
    expect(summariseAttempt([q([], false)]).skipped).toBe(1);
    expect(summariseAttempt([q(['A'], true)]).correct).toBe(1);
  });

  /**
   * A drawing waiting on a human marker is not a question the student ducked.
   * Counting it as a skip would put one on every student who did the paper
   * properly, which is the fastest way to make the number worthless.
   */
  it('never reports an unmarked drawing as skipped', () => {
    const b = summariseAttempt([q('A', true), q(null, null, false), q(null, null, false)]);
    expect(b.skipped).toBe(0);
    expect(b.gradable).toBe(1);
    expect(b.total).toBe(3);
  });

  /**
   * is_gradable is absent rather than false on older review rows. Defaulting to
   * "not gradable" would report a whole paper as zero of zero.
   */
  it('treats a missing is_gradable as gradable', () => {
    const b = summariseAttempt([{ selected: 'A', is_correct: true }, { selected: null, is_correct: false }]);
    expect(b.gradable).toBe(2);
    expect(b.correct).toBe(1);
    expect(b.skipped).toBe(1);
  });

  it('survives an empty or missing review', () => {
    expect(summariseAttempt([]).gradable).toBe(0);
    expect(summariseAttempt(undefined as never).total).toBe(0);
  });

  it('counts answered as correct plus wrong, never including skips', () => {
    const b = summariseAttempt([q('A', true), q('B', false), q(null, false)]);
    expect(b.answered).toBe(2);
  });
});

describe('formatBreakdown', () => {
  it('names the denominator a student actually faced', () => {
    expect(formatBreakdown(summariseAttempt([q('A', true), q('B', false), q(null, false)]))).toBe(
      '1 right · 1 wrong · 1 skipped of 3',
    );
  });

  /**
   * Silent when there is nothing to say. A "0 skipped" on every good sitting
   * trains people to stop reading the line, which costs the signal it exists
   * to carry.
   */
  it('says nothing about skips when there were none', () => {
    expect(formatBreakdown(summariseAttempt([q('A', true), q('B', false)]))).toBe('1 right · 1 wrong of 2');
  });
});
