import { describe, it, expect } from 'vitest';
import { computeCatchupPace, itemDueOn, describeCatchupPace } from './catchup-pace';

const START = '2026-07-01';
const base = { started_on: START, weekly_quota: 2, total_items: 10, completed_items: 0 };

describe('itemDueOn', () => {
  it('gives a whole week per quota slot', () => {
    // Quota 2: items 1 and 2 share the end of week one.
    expect(itemDueOn(START, 2, 1)).toBe('2026-07-07');
    expect(itemDueOn(START, 2, 2)).toBe('2026-07-07');
    expect(itemDueOn(START, 2, 3)).toBe('2026-07-14');
    expect(itemDueOn(START, 2, 4)).toBe('2026-07-14');
  });

  it('handles a quota of one', () => {
    expect(itemDueOn(START, 1, 1)).toBe('2026-07-07');
    expect(itemDueOn(START, 1, 2)).toBe('2026-07-14');
  });

  it('handles a large quota', () => {
    expect(itemDueOn(START, 7, 7)).toBe('2026-07-07');
    expect(itemDueOn(START, 7, 8)).toBe('2026-07-14');
  });

  it('treats a nonsense quota as one rather than dividing by zero', () => {
    expect(itemDueOn(START, 0, 1)).toBe('2026-07-07');
  });
});

describe('computeCatchupPace', () => {
  it('owes nothing during the first week', () => {
    // The whole point: a student who joined on Monday is not "behind" on Tuesday.
    for (const day of ['2026-07-01', '2026-07-04', '2026-07-07']) {
      const p = computeCatchupPace(base, day);
      expect(p.expected_by_now).toBe(0);
      expect(p.state).toBe('on_track');
    }
  });

  it('expects the first week of work once a full week has passed', () => {
    const p = computeCatchupPace(base, '2026-07-08');
    expect(p.weeks_elapsed).toBe(1);
    expect(p.expected_by_now).toBe(2);
    expect(p.deficit).toBe(2);
    expect(p.state).toBe('behind');
  });

  it('is on track when the student kept up', () => {
    const p = computeCatchupPace({ ...base, completed_items: 4 }, '2026-07-15');
    expect(p.expected_by_now).toBe(4);
    expect(p.deficit).toBe(0);
    expect(p.state).toBe('on_track');
  });

  it('is on track when the student ran ahead', () => {
    const p = computeCatchupPace({ ...base, completed_items: 9 }, '2026-07-08');
    expect(p.deficit).toBe(0);
    expect(p.state).toBe('on_track');
    expect(p.remaining).toBe(1);
  });

  it('is done when everything is cleared, however late', () => {
    const p = computeCatchupPace({ ...base, completed_items: 10 }, '2026-12-01');
    expect(p.state).toBe('done');
    expect(p.remaining).toBe(0);
    expect(p.next_due_on).toBeNull();
  });

  it('never expects more than the backlog holds', () => {
    const p = computeCatchupPace({ ...base, total_items: 3 }, '2027-07-01');
    expect(p.expected_by_now).toBe(3);
    expect(p.deficit).toBe(3);
  });

  it('is done, not behind, when there is no work at all', () => {
    // Every class excluded or excused leaves an empty denominator. That is
    // someone with nothing to do, not someone failing.
    const p = computeCatchupPace({ ...base, total_items: 0, completed_items: 0 }, '2026-12-01');
    expect(p.state).toBe('done');
    expect(p.deficit).toBe(0);
    expect(p.finish_by).toBeNull();
  });

  it('does not go negative when the clock starts in the future', () => {
    const p = computeCatchupPace(base, '2026-06-01');
    expect(p.weeks_elapsed).toBe(0);
    expect(p.expected_by_now).toBe(0);
    expect(p.deficit).toBe(0);
  });

  it('clamps a completed count that overshoots the total', () => {
    const p = computeCatchupPace({ ...base, total_items: 3, completed_items: 99 }, '2026-08-01');
    expect(p.remaining).toBe(0);
    expect(p.state).toBe('done');
  });

  it('points at the next unfinished item and the final deadline', () => {
    const p = computeCatchupPace({ ...base, completed_items: 2 }, '2026-07-08');
    expect(p.next_due_on).toBe(itemDueOn(START, 2, 3));
    expect(p.finish_by).toBe(itemDueOn(START, 2, 10));
  });

  it('works with a quota of one', () => {
    const p = computeCatchupPace(
      { started_on: START, weekly_quota: 1, total_items: 5, completed_items: 1 },
      '2026-07-22',
    );
    expect(p.expected_by_now).toBe(3);
    expect(p.deficit).toBe(2);
  });
});

describe('describeCatchupPace', () => {
  it('speaks in singular for one class', () => {
    const p = computeCatchupPace({ ...base, completed_items: 1 }, '2026-07-08');
    expect(describeCatchupPace(p, 2)).toContain('1 class behind');
    expect(describeCatchupPace(p, 2)).not.toContain('classes behind');
  });

  it('speaks in plural for several', () => {
    const p = computeCatchupPace(base, '2026-07-15');
    expect(describeCatchupPace(p, 2)).toContain('4 classes behind');
  });

  it('has something kind to say when finished', () => {
    const p = computeCatchupPace({ ...base, completed_items: 10 }, '2026-07-15');
    expect(describeCatchupPace(p, 2)).toContain('all caught up');
  });

  it('uses no em dashes, per the house copy rule', () => {
    const states = [
      computeCatchupPace(base, '2026-07-15'),
      computeCatchupPace({ ...base, completed_items: 10 }, '2026-07-15'),
      computeCatchupPace({ ...base, completed_items: 4 }, '2026-07-15'),
    ];
    for (const p of states) {
      expect(describeCatchupPace(p, 2)).not.toMatch(/[—–]|--/);
    }
  });
});
