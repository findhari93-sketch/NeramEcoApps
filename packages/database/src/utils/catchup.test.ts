import { describe, it, expect } from 'vitest';
import {
  classifyCatchupCandidate,
  catchupItemStep,
  isCatchupItemComplete,
  resolveCatchupBacklog,
  summariseCatchupBacklog,
  summariseMissedClasses,
  missedClassDueOn,
  isOverdue,
  addDaysYmd,
  type CatchupItemFacts,
} from './catchup';

const cls = (over: Partial<Parameters<typeof classifyCatchupCandidate>[0]> = {}) => ({
  status: 'completed',
  recording_url: null,
  youtube_url: null,
  ...over,
});

/** A class with everything still to do. */
const open = (over: Partial<CatchupItemFacts> = {}): CatchupItemFacts => ({
  watched: false,
  assignmentsOutstanding: 1,
  hasTest: true,
  testPassed: false,
  ...over,
});

/** A class where every gate is cleared. */
const cleared = (over: Partial<CatchupItemFacts> = {}): CatchupItemFacts => ({
  watched: true,
  assignmentsOutstanding: 0,
  hasTest: true,
  testPassed: true,
  ...over,
});

describe('classifyCatchupCandidate', () => {
  it('is eligible when a published recap exists', () => {
    expect(classifyCatchupCandidate(cls(), { id: 'r1', status: 'published' })).toBe('eligible');
  });

  it('is not_ready when a recording exists but the recap is still a draft', () => {
    expect(
      classifyCatchupCandidate(cls({ recording_url: 'https://sp/rec.mp4' }), {
        id: 'r1',
        status: 'draft',
      }),
    ).toBe('not_ready');
  });

  it('is not_ready for a raw recording with no recap at all', () => {
    expect(classifyCatchupCandidate(cls({ youtube_url: 'https://yt/abc' }), null)).toBe('not_ready');
  });

  it('is no_recording when there is nothing to watch', () => {
    expect(classifyCatchupCandidate(cls(), null)).toBe('no_recording');
  });

  it('skips a cancelled class even when it somehow has a published recap', () => {
    expect(
      classifyCatchupCandidate(cls({ status: 'cancelled', recording_url: 'https://sp/x.mp4' }), {
        id: 'r1',
        status: 'published',
      }),
    ).toBe('skip');
  });
});

describe('catchupItemStep', () => {
  it('walks watch, then assignment, then test', () => {
    expect(catchupItemStep(open())).toBe('watch');
    expect(catchupItemStep(open({ watched: true }))).toBe('assignment');
    expect(catchupItemStep(open({ watched: true, assignmentsOutstanding: 0 }))).toBe('test');
    expect(catchupItemStep(cleared())).toBe('done');
  });

  it('finishes at the assignment when no test is placed on the class', () => {
    const noTest = open({ watched: true, assignmentsOutstanding: 0, hasTest: false });
    expect(catchupItemStep(noTest)).toBe('done');
    expect(isCatchupItemComplete(noTest)).toBe(true);
  });

  it('does not let a passed test paper over unwatched video or unsubmitted work', () => {
    expect(isCatchupItemComplete(open({ testPassed: true }))).toBe(false);
    expect(isCatchupItemComplete(open({ watched: true, testPassed: true }))).toBe(false);
  });

  it('treats an excused class as complete and an excluded one as never complete', () => {
    expect(isCatchupItemComplete(open({ excused: true }))).toBe(true);
    expect(isCatchupItemComplete(cleared({ excluded: true }))).toBe(false);
  });
});

describe('resolveCatchupBacklog', () => {
  it('opens exactly one item and locks the rest', () => {
    const r = resolveCatchupBacklog([cleared(), open(), open(), open()]);
    expect(r.map((i) => i.status)).toEqual(['done', 'current', 'locked', 'locked']);
    expect(r.map((i) => i.position)).toEqual([1, 2, 3, 4]);
  });

  it('has no current item once the whole backlog is cleared', () => {
    const r = resolveCatchupBacklog([cleared(), cleared()]);
    expect(r.every((i) => i.status === 'done')).toBe(true);
  });

  it('steps over a class with no recording instead of stalling behind it', () => {
    const r = resolveCatchupBacklog([open({ excluded: true }), open(), open()]);
    expect(r.map((i) => i.status)).toEqual(['blocked', 'current', 'locked']);
    // Excluded work is not numbered, so the student is never told to do "class 1"
    // when class 1 is the one they cannot do.
    expect(r.map((i) => i.position)).toEqual([null, 1, 2]);
  });

  it('steps over a class the teacher has not prepared yet', () => {
    const r = resolveCatchupBacklog([open({ notReady: true }), open()]);
    expect(r.map((i) => i.status)).toEqual(['pending_teacher', 'current']);
    expect(r[0].countsTowardPace).toBe(false);
  });

  it('steps over an excused class without opening it', () => {
    const r = resolveCatchupBacklog([open({ excused: true }), open()]);
    expect(r.map((i) => i.status)).toEqual(['excused', 'current']);
    expect(r[0].step).toBe('done');
  });

  it('is empty-safe', () => {
    expect(resolveCatchupBacklog([])).toEqual([]);
  });
});

describe('summariseCatchupBacklog', () => {
  it('counts only work the student could actually do', () => {
    const r = resolveCatchupBacklog([
      cleared(),
      cleared(),
      open(),
      open({ excluded: true }),
      open({ notReady: true }),
      open({ excused: true }),
    ]);
    // 2 done + 1 open = 3 countable. The excluded, not-ready and excused rows
    // stay out of the denominator so nobody is marked behind for them.
    expect(summariseCatchupBacklog(r)).toEqual({
      total: 3,
      completed: 2,
      blocked: 1,
      pendingTeacher: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// A class you were here for and missed
// ---------------------------------------------------------------------------

describe('unchained items', () => {
  it('never waits its turn', () => {
    // Three missed classes, none finished. All three are startable. The chained
    // rule would have opened only the first and locked the other two.
    const r = resolveCatchupBacklog([
      open({ chained: false }),
      open({ chained: false }),
      open({ chained: false }),
    ]);
    expect(r.map((x) => x.status)).toEqual(['open', 'open', 'open']);
  });

  it('never holds up a chained backlog behind it', () => {
    // The dangerous mix: a late joiner who then misses a live class. The missed
    // class must not consume the backlog's one open slot, and must not sit
    // locked behind six months of syllabus either.
    const r = resolveCatchupBacklog([
      open({ chained: false }),
      open(),
      open(),
    ]);
    expect(r[0].status).toBe('open');
    expect(r[1].status).toBe('current');
    expect(r[2].status).toBe('locked');
  });

  it('stays out of the weekly quota entirely', () => {
    // Pace is a promise about the backlog. A missed class arriving must not
    // silently move the target the student was measured against.
    const r = resolveCatchupBacklog([open({ chained: false }), cleared(), open()]);
    expect(summariseCatchupBacklog(r)).toMatchObject({ total: 2, completed: 1 });
    expect(r[0].position).toBeNull();
    expect(r[0].countsTowardPace).toBe(false);
  });

  it('still reports done when every gate is cleared', () => {
    const r = resolveCatchupBacklog([cleared({ chained: false })]);
    expect(r[0].status).toBe('done');
  });

  it('is still excluded when the class was never recorded', () => {
    const r = resolveCatchupBacklog([open({ chained: false, excluded: true })]);
    expect(r[0].status).toBe('blocked');
  });

  it('is still waived when a teacher excuses it', () => {
    const r = resolveCatchupBacklog([open({ chained: false, excused: true })]);
    expect(r[0].status).toBe('excused');
  });

  it('treats an item with no chained flag as chained, so nothing regressed', () => {
    const r = resolveCatchupBacklog([open(), open()]);
    expect(r.map((x) => x.status)).toEqual(['current', 'locked']);
    expect(r[0].chained).toBe(true);
  });
});

describe('missedClassDueOn', () => {
  it('is the day the course next runs', () => {
    expect(missedClassDueOn('2026-07-22', '2026-07-28')).toBe('2026-07-28');
  });

  it('falls back to a week when nothing is scheduled after it', () => {
    // End of term, or a break. A missed class still needs a deadline.
    expect(missedClassDueOn('2026-07-22', null)).toBe('2026-07-29');
  });

  it('refuses a next class that is not actually later', () => {
    // Bad data must not mark someone overdue the moment they open the screen.
    expect(missedClassDueOn('2026-07-22', '2026-07-20')).toBe('2026-07-29');
    expect(missedClassDueOn('2026-07-22', '2026-07-22')).toBe('2026-07-29');
  });

  it('tolerates a full timestamp on either side', () => {
    expect(missedClassDueOn('2026-07-22T00:00:00Z', '2026-07-28T00:00:00Z')).toBe('2026-07-28');
  });
});

describe('isOverdue', () => {
  it('gives the student the whole of the due day', () => {
    // Classes run in the evening, so being due today is not being late.
    expect(isOverdue('2026-07-28', '2026-07-28')).toBe(false);
    expect(isOverdue('2026-07-28', '2026-07-27')).toBe(false);
    expect(isOverdue('2026-07-28', '2026-07-29')).toBe(true);
  });

  it('is never overdue with no deadline', () => {
    expect(isOverdue(null, '2026-07-29')).toBe(false);
  });
});

describe('addDaysYmd', () => {
  it('crosses a month boundary', () => {
    expect(addDaysYmd('2026-07-28', 7)).toBe('2026-08-04');
  });

  it('crosses a year boundary', () => {
    expect(addDaysYmd('2026-12-30', 5)).toBe('2027-01-04');
  });

  it('handles a leap day', () => {
    expect(addDaysYmd('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('summariseMissedClasses', () => {
  it('counts only the missed half, and only what is owed', () => {
    const facts = [
      open({ chained: false }),                  // owed, overdue
      cleared({ chained: false }),               // done
      open({ chained: false, excused: true }),   // waived, owes nothing
      open({ chained: false, excluded: true }),  // no recording, owes nothing
      open(),                                    // a backlog item, not counted
    ];
    const resolved = resolveCatchupBacklog(facts);
    const overdue = [true, false, false, false, false];

    expect(summariseMissedClasses(resolved, overdue)).toEqual({
      total: 2,
      completed: 1,
      open: 1,
      overdue: 1,
    });
  });

  it('reports nothing when there are no missed classes', () => {
    const resolved = resolveCatchupBacklog([open(), cleared()]);
    expect(summariseMissedClasses(resolved, [false, false])).toEqual({
      total: 0,
      completed: 0,
      open: 0,
      overdue: 0,
    });
  });
});

