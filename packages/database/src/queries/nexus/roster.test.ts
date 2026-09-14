import { describe, expect, it } from 'vitest';
import { isTracked, pickTrackedIds } from './roster';

const activeUser = { is_alumni: false };

describe('isTracked', () => {
  it('counts an active, participating, non-alumni student', () => {
    expect(isTracked({ is_active: true, participation_status: 'active', user: activeUser })).toBe(
      true,
    );
  });

  it('drops a dormant student', () => {
    expect(isTracked({ is_active: true, participation_status: 'dormant', user: activeUser })).toBe(
      false,
    );
  });

  it('drops a student removed from the classroom', () => {
    expect(isTracked({ is_active: false, participation_status: 'active', user: activeUser })).toBe(
      false,
    );
  });

  it('drops a graduated student', () => {
    expect(
      isTracked({ is_active: true, participation_status: 'active', user: { is_alumni: true } }),
    ).toBe(false);
  });

  // A missing embed means the join did not resolve. Counting the row anyway
  // would inflate every denominator with a student nobody can name.
  it('drops a row whose user embed failed to resolve', () => {
    expect(isTracked({ is_active: true, participation_status: 'active', user: null })).toBe(false);
    expect(isTracked({ is_active: true, participation_status: 'active' })).toBe(false);
  });

  it('treats a missing participation_status as active, matching the column default', () => {
    expect(isTracked({ is_active: true, user: activeUser })).toBe(true);
    expect(isTracked({ is_active: true, participation_status: null, user: activeUser })).toBe(true);
  });

  it('is safe on a null row', () => {
    expect(isTracked(null as never)).toBe(false);
  });
});

describe('pickTrackedIds', () => {
  // THE test for this module. sendNudge is also handed parent ids by
  // api/timetable/prework-escalations, which documents that it relies on
  // sendNudge doing no user_type filtering. An inner-join style filter here
  // would silently kill every parent escalation.
  it('passes through an id with no student enrolment at all (a parent)', () => {
    const { kept, dropped } = pickTrackedIds([], ['parent-1']);
    expect(kept).toEqual(['parent-1']);
    expect(dropped).toEqual([]);
  });

  it('drops a student whose only enrolment is dormant', () => {
    const rows = [{ user_id: 'stu-1', participation_status: 'dormant' }];
    const { kept, dropped } = pickTrackedIds(rows, ['stu-1']);
    expect(kept).toEqual([]);
    expect(dropped).toEqual(['stu-1']);
  });

  // Dormant in an old classroom must not mute someone who is active in the
  // current one.
  it('keeps a student dormant in one classroom but active in another', () => {
    const rows = [
      { user_id: 'stu-1', participation_status: 'dormant' },
      { user_id: 'stu-1', participation_status: 'active' },
    ];
    expect(pickTrackedIds(rows, ['stu-1']).kept).toEqual(['stu-1']);
  });

  it('keeps an active student', () => {
    const rows = [{ user_id: 'stu-1', participation_status: 'active' }];
    expect(pickTrackedIds(rows, ['stu-1']).kept).toEqual(['stu-1']);
  });

  it('treats a null participation_status as active', () => {
    const rows = [{ user_id: 'stu-1', participation_status: null }];
    expect(pickTrackedIds(rows, ['stu-1']).kept).toEqual(['stu-1']);
  });

  it('splits a mixed batch and preserves the requested order', () => {
    const rows = [
      { user_id: 'a', participation_status: 'active' },
      { user_id: 'b', participation_status: 'dormant' },
      { user_id: 'c', participation_status: 'active' },
    ];
    const { kept, dropped } = pickTrackedIds(rows, ['c', 'b', 'a', 'parent-1']);
    expect(kept).toEqual(['c', 'a', 'parent-1']);
    expect(dropped).toEqual(['b']);
  });

  it('handles an empty request', () => {
    expect(pickTrackedIds([{ user_id: 'a', participation_status: 'dormant' }], [])).toEqual({
      kept: [],
      dropped: [],
    });
  });

  describe('Not started (dormant_source auto)', () => {
    const notStarted = { user_id: 'new-1', participation_status: 'dormant', dormant_source: 'auto' };
    const paused = { user_id: 'paused-1', participation_status: 'dormant', dormant_source: 'staff' };

    it('drops a Not started student from ordinary messages', () => {
      expect(pickTrackedIds([notStarted], ['new-1']).dropped).toEqual(['new-1']);
    });

    it('reaches a Not started student when the message is about getting them in', () => {
      expect(pickTrackedIds([notStarted], ['new-1'], { reachNotStarted: true }).kept).toEqual(['new-1']);
    });

    // A join reminder must never chase someone a person paused (a refund case).
    it('still drops a student paused by staff with reachNotStarted', () => {
      const { kept, dropped } = pickTrackedIds([paused], ['paused-1'], { reachNotStarted: true });
      expect(kept).toEqual([]);
      expect(dropped).toEqual(['paused-1']);
    });

    it('still passes a parent id through with reachNotStarted', () => {
      const { kept } = pickTrackedIds([notStarted, paused], ['parent-1', 'new-1', 'paused-1'], {
        reachNotStarted: true,
      });
      expect(kept).toEqual(['parent-1', 'new-1']);
    });
  });
});
