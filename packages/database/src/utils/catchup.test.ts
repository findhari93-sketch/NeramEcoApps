import { describe, it, expect } from 'vitest';
import {
  classifyCatchupCandidate,
  catchupItemStep,
  isCatchupItemComplete,
  resolveCatchupBacklog,
  summariseCatchupBacklog,
  summariseMissedClasses,
  summariseCatchupClock,
  missedClassDueOn,
  isOverdue,
  addDaysYmd,
  diffDaysYmd,
  catchupWindowDays,
  catchupDueOn,
  catchupDaysLeft,
  catchupDaysSpent,
  bankCatchupClock,
  isCatchupClockRunning,
  planCatchupActivation,
  DEFAULT_CATCHUP_WINDOWS,
  type CatchupItemFacts,
  type ResolveCatchupContext,
} from './catchup';

const cls = (over: Partial<Parameters<typeof classifyCatchupCandidate>[0]> = {}) => ({
  status: 'completed',
  recording_url: null,
  youtube_url: null,
  ...over,
});

const TODAY = '2026-08-10';

/** The context every resolve needs, with the shipped defaults. */
const ctx = (over: Partial<ResolveCatchupContext> = {}): ResolveCatchupContext => ({
  today: TODAY,
  windows: DEFAULT_CATCHUP_WINDOWS,
  ...over,
});

/** A clock started on `on`, with `used` days already banked from earlier stints. */
const clock = (on: string | null, used = 0) => ({ activatedOn: on, daysUsed: used });

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

  /**
   * The dead end this feature shipped with.
   *
   * `notReady` is exactly the state "there is a recording but no published
   * recap", which is the same state in which `isWatched` accepts a student's own
   * "I have watched it" and the screen offers the button to say it. So a student
   * could clear every step the screen showed them, watch the recording, submit
   * the work, see three green ticks, and be refused by the server with the one
   * message that names no cause: "This class cannot be completed yet."
   *
   * Seen in production on 2026-08-06: a student on "Coordinate Geometry Basics
   * and Formulas" (28 Jul) with reason given, recording watched on 1 Aug and the
   * assignment in, whose recap had been drafted but not published.
   *
   * A recap nobody published is the teacher's outstanding work, not the
   * student's. `pending_teacher` is documented as blocking nothing, and this is
   * where it blocked the only thing that mattered.
   */
  it('lets a student finish a class whose recap was never published', () => {
    expect(isCatchupItemComplete(cleared({ notReady: true }))).toBe(true);
    expect(catchupItemStep(cleared({ notReady: true }))).toBe('done');
  });

  it('still holds an unprepared class open when the student has work left', () => {
    // Only the finished ones move. Nothing here excuses the steps themselves.
    expect(isCatchupItemComplete(open({ notReady: true }))).toBe(false);
    expect(catchupItemStep(open({ notReady: true }))).toBe('watch');
  });
});

describe('resolveCatchupBacklog', () => {
  it('leaves every unfinished item startable, and locks nothing', () => {
    // The old rule opened one and padlocked the rest. One unprepared recap in
    // the middle then stalled the entire backlog behind it.
    const r = resolveCatchupBacklog([cleared(), open(), open(), open()], ctx());
    expect(r.map((i) => i.status)).toEqual(['done', 'waiting', 'waiting', 'waiting']);
    expect(r.map((i) => i.position)).toEqual([1, 2, 3, 4]);
  });

  it('recommends exactly one item, the oldest that is startable', () => {
    const r = resolveCatchupBacklog([cleared(), open(), open()], ctx());
    expect(r.filter((i) => i.recommended)).toHaveLength(1);
    expect(r[1].recommended).toBe(true);
    expect(r.map((i) => i.order)).toEqual([null, 1, 2]);
  });

  it('gives nothing a deadline until something is started', () => {
    // The whole point. Four missed classes used to render four red "Was due"
    // cards on first open, with no way to tell where to begin.
    const r = resolveCatchupBacklog([open(), open(), open(), open()], ctx());
    expect(r.every((i) => i.dueOn === null)).toBe(true);
    expect(r.every((i) => i.overdue === false)).toBe(true);
    expect(r.some((i) => i.active)).toBe(false);
  });

  it('recommends nothing once the whole backlog is cleared', () => {
    const r = resolveCatchupBacklog([cleared(), cleared()], ctx());
    expect(r.every((i) => i.status === 'done')).toBe(true);
    expect(r.some((i) => i.recommended)).toBe(false);
  });

  it('steps over a class with no recording instead of recommending it', () => {
    const r = resolveCatchupBacklog([open({ excluded: true }), open(), open()], ctx());
    expect(r.map((i) => i.status)).toEqual(['blocked', 'waiting', 'waiting']);
    // Excluded work is not numbered, so the student is never told to do "class 1"
    // when class 1 is the one they cannot do.
    expect(r.map((i) => i.position)).toEqual([null, 1, 2]);
    expect(r[1].recommended).toBe(true);
  });

  it('steps over a class the teacher has not prepared yet', () => {
    const r = resolveCatchupBacklog([open({ notReady: true }), open()], ctx());
    expect(r.map((i) => i.status)).toEqual(['pending_teacher', 'waiting']);
    expect(r[0].countsTowardPace).toBe(false);
    expect(r[0].order).toBeNull();
  });

  it('reads a finished class as done even if its recap never arrived', () => {
    // Waiting on the teacher is a state for work the student still owes. Once
    // they have finished it, calling it pending_teacher would tell them the
    // class is unfinished and hold the journey open behind it.
    const r = resolveCatchupBacklog([cleared({ notReady: true }), open()], ctx());
    expect(r.map((i) => i.status)).toEqual(['done', 'waiting']);
    expect(r[0].countsTowardPace).toBe(true);
    expect(summariseCatchupBacklog(r)).toMatchObject({
      total: 2,
      completed: 1,
      pendingTeacher: 0,
    });
  });

  it('steps over an excused class without recommending it', () => {
    const r = resolveCatchupBacklog([open({ excused: true }), open()], ctx());
    expect(r.map((i) => i.status)).toEqual(['excused', 'waiting']);
    expect(r[0].step).toBe('done');
  });

  it('is empty-safe', () => {
    expect(resolveCatchupBacklog([], ctx())).toEqual([]);
  });
});

describe('resolveCatchupBacklog: one clock', () => {
  it('marks the started item active and gives only it a deadline', () => {
    const r = resolveCatchupBacklog(
      [open(), open({ clock: clock('2026-08-08') }), open()],
      ctx(),
    );
    expect(r.map((i) => i.status)).toEqual(['waiting', 'active', 'waiting']);
    expect(r[1].dueOn).toBe('2026-08-14'); // started 08-08 + (7 - 0 - 1)
    expect(r[1].daysLeft).toBe(4);
    expect(r[0].dueOn).toBeNull();
    expect(r[2].dueOn).toBeNull();
  });

  it('points the recommendation at the running clock, not the oldest', () => {
    // Telling a student to go and do something else while their clock ticks on
    // this one contradicts itself.
    const r = resolveCatchupBacklog(
      [open(), open(), open({ clock: clock('2026-08-08') })],
      ctx(),
    );
    expect(r[2].recommended).toBe(true);
    expect(r[2].order).toBe(1);
  });

  it('reports overdue only once the due day has passed', () => {
    const onTime = resolveCatchupBacklog([open({ clock: clock('2026-08-04') })], ctx());
    expect(onTime[0].dueOn).toBe('2026-08-10');
    expect(onTime[0].overdue).toBe(false); // the due day itself is not late

    const late = resolveCatchupBacklog([open({ clock: clock('2026-08-03') })], ctx());
    expect(late[0].dueOn).toBe('2026-08-09');
    expect(late[0].overdue).toBe(true);
    expect(late[0].daysLeft).toBe(-1);
  });

  it('collapses two running clocks to the earliest, deterministically', () => {
    // The partial unique index makes this impossible in the database, but the
    // write is two statements. A half-finished switch must still draw a
    // coherent screen rather than two competing deadlines.
    const r = resolveCatchupBacklog(
      [open({ clock: clock('2026-08-09') }), open({ clock: clock('2026-08-06') })],
      ctx(),
    );
    expect(r.filter((i) => i.active)).toHaveLength(1);
    expect(r[1].active).toBe(true);
  });

  it('never puts a clock on a finished item', () => {
    const r = resolveCatchupBacklog([cleared({ clock: clock('2026-08-08') }), open()], ctx());
    expect(r[0].status).toBe('done');
    expect(r[0].active).toBe(false);
    expect(r[0].dueOn).toBeNull();
  });
});

describe('resolveCatchupBacklog: what to do first', () => {
  it('puts a missed live class ahead of the whole late joiner backlog', () => {
    // A late joiner with months of backlog who then misses tomorrow's class.
    // The live class is the one the course is building on right now.
    const r = resolveCatchupBacklog(
      [open({ kind: 'late_joiner' }), open({ kind: 'late_joiner' }), open({ kind: 'no_show' })],
      ctx(),
    );
    expect(r[2].recommended).toBe(true);
    expect(r.map((i) => i.order)).toEqual([2, 3, 1]);
  });

  it('keeps oldest first within each group', () => {
    const r = resolveCatchupBacklog(
      [open({ kind: 'no_show' }), open({ kind: 'opted_out' }), open({ kind: 'late_joiner' })],
      ctx(),
    );
    expect(r.map((i) => i.order)).toEqual([1, 2, 3]);
  });

  it('gives a declined class the shorter window', () => {
    const r = resolveCatchupBacklog(
      [open({ kind: 'opted_out' }), open({ kind: 'no_show' }), open({ kind: 'late_joiner' })],
      ctx(),
    );
    expect(r.map((i) => i.windowDays)).toEqual([3, 7, 7]);
  });
});

describe('summariseCatchupBacklog', () => {
  it('counts only work the student could actually do', () => {
    const r = resolveCatchupBacklog(
      [
        cleared(),
        cleared(),
        open(),
        open({ excluded: true }),
        open({ notReady: true }),
        open({ excused: true }),
      ],
      ctx(),
    );
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
    const r = resolveCatchupBacklog(
      [open({ chained: false }), open({ chained: false }), open({ chained: false })],
      ctx(),
    );
    expect(r.map((x) => x.status)).toEqual(['waiting', 'waiting', 'waiting']);
  });

  it('stays out of the weekly quota entirely', () => {
    // Pace is a promise about the backlog. A missed class arriving must not
    // silently move the target the student was measured against.
    const r = resolveCatchupBacklog([open({ chained: false }), cleared(), open()], ctx());
    expect(summariseCatchupBacklog(r)).toMatchObject({ total: 2, completed: 1 });
    expect(r[0].position).toBeNull();
    expect(r[0].countsTowardPace).toBe(false);
  });

  it('still reports done when every gate is cleared', () => {
    const r = resolveCatchupBacklog([cleared({ chained: false })], ctx());
    expect(r[0].status).toBe('done');
  });

  it('is still excluded when the class was never recorded', () => {
    const r = resolveCatchupBacklog([open({ chained: false, excluded: true })], ctx());
    expect(r[0].status).toBe('blocked');
  });

  it('is still waived when a teacher excuses it', () => {
    const r = resolveCatchupBacklog([open({ chained: false, excused: true })], ctx());
    expect(r[0].status).toBe('excused');
  });

  it('reads a caller that still speaks only of chained, so nothing regressed', () => {
    const r = resolveCatchupBacklog([open(), open()], ctx());
    expect(r[0].chained).toBe(true);
    expect(r[0].kind).toBe('late_joiner');
    // And the reverse: chained:false with no kind is a class they were here for.
    const legacy = resolveCatchupBacklog([open({ chained: false })], ctx());
    expect(legacy[0].kind).toBe('no_show');
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
      open({ chained: false, clock: clock('2026-08-01') }), // owed, started, late
      cleared({ chained: false }),                          // done
      open({ chained: false, excused: true }),              // waived, owes nothing
      open({ chained: false, excluded: true }),             // no recording, owes nothing
      open(),                                               // a backlog item, not counted
    ];
    const resolved = resolveCatchupBacklog(facts, ctx());

    expect(summariseMissedClasses(resolved)).toEqual({
      total: 2,
      completed: 1,
      open: 1,
      overdue: 1,
      waiting: 0,
    });
  });

  it('counts an unstarted missed class as waiting, never as overdue', () => {
    const resolved = resolveCatchupBacklog(
      [open({ chained: false }), open({ chained: false })],
      ctx(),
    );
    expect(summariseMissedClasses(resolved)).toMatchObject({ open: 2, overdue: 0, waiting: 2 });
  });

  it('reports nothing when there are no missed classes', () => {
    const resolved = resolveCatchupBacklog([open(), cleared()], ctx());
    expect(summariseMissedClasses(resolved)).toEqual({
      total: 0,
      completed: 0,
      open: 0,
      overdue: 0,
      waiting: 0,
    });
  });
});

describe('summariseCatchupClock', () => {
  it('flags a student with work owed and no clock running', () => {
    // The replacement chase signal. "How many are overdue" can only ever be one
    // now, so it stopped being a magnitude a teacher can sort by.
    const r = resolveCatchupBacklog([open(), open()], ctx());
    expect(summariseCatchupClock(r)).toEqual({
      active: false,
      waiting: 2,
      overdue: false,
      daysLeft: null,
      stalled: true,
    });
  });

  it('is not stalled while something is running', () => {
    const r = resolveCatchupBacklog([open({ clock: clock('2026-08-08') }), open()], ctx());
    expect(summariseCatchupClock(r)).toMatchObject({
      active: true,
      waiting: 1,
      daysLeft: 4,
      stalled: false,
    });
  });

  it('is not stalled when there is simply nothing owed', () => {
    const r = resolveCatchupBacklog([cleared(), cleared()], ctx());
    expect(summariseCatchupClock(r)).toMatchObject({ stalled: false, waiting: 0 });
  });
});

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

describe('catchupWindowDays', () => {
  it('gives a declined class less time than a genuine absence', () => {
    expect(catchupWindowDays('opted_out')).toBe(3);
    expect(catchupWindowDays('no_show')).toBe(7);
    expect(catchupWindowDays('late_joiner')).toBe(7);
  });

  it('honours a classroom override', () => {
    const w = { standardDays: 10, optedOutDays: 2 };
    expect(catchupWindowDays('late_joiner', w)).toBe(10);
    expect(catchupWindowDays('opted_out', w)).toBe(2);
  });

  it('falls back rather than handing out a zero day window', () => {
    expect(catchupWindowDays('no_show', { standardDays: 0, optedOutDays: 3 })).toBe(7);
    expect(catchupWindowDays('no_show', { standardDays: NaN, optedOutDays: 3 })).toBe(7);
  });
});

describe('catchupDueOn', () => {
  it('is null until the student starts, which is the whole redesign', () => {
    expect(catchupDueOn({ activatedOn: null, daysUsed: 0 }, 7)).toBeNull();
    expect(catchupDueOn(null, 7)).toBeNull();
  });

  it('gives the full window from the day they started, inclusive', () => {
    // Start Monday with 7 days: due Sunday, and Sunday itself is not late.
    expect(catchupDueOn(clock('2026-08-10'), 7)).toBe('2026-08-16');
    expect(isOverdue('2026-08-16', '2026-08-16')).toBe(false);
  });

  it('subtracts days already spent, so a restart is not a fresh window', () => {
    expect(catchupDueOn(clock('2026-08-10', 3), 7)).toBe('2026-08-13');
  });

  it('lands in the past when the window is already spent', () => {
    // Deliberate. Moving it forward on every restart would hand out a free day
    // per restart, which is the exploit again at a slower rate.
    expect(catchupDueOn(clock('2026-08-10', 12), 7)).toBe('2026-08-04');
  });

  it('treats an unparseable activation date as not started rather than throwing', () => {
    // The nudge cron sweeps every running clock in the school in one pass. One
    // malformed row must not take the whole run down, and reading as "not
    // started" is the safe direction: nobody gets chased by mistake.
    expect(catchupDueOn({ activatedOn: 'null', daysUsed: 0 }, 7)).toBeNull();
    expect(catchupDueOn({ activatedOn: 'not-a-date', daysUsed: 0 }, 7)).toBeNull();
    expect(catchupDueOn({ activatedOn: '', daysUsed: 0 }, 7)).toBeNull();
  });
});

describe('bankCatchupClock: switching is not a reset', () => {
  it('banks the days actually spent', () => {
    expect(bankCatchupClock(clock('2026-08-07'), '2026-08-10')).toBe(3);
  });

  it('adds to what was already banked', () => {
    expect(bankCatchupClock(clock('2026-08-07', 2), '2026-08-10')).toBe(5);
  });

  it('banks nothing for a stopped clock', () => {
    expect(bankCatchupClock(clock(null, 4), '2026-08-10')).toBe(4);
  });

  it('makes a same-day switch away and back a no-op', () => {
    // The obvious exploit attempt: bail out and come straight back for a fresh
    // seven days. Banking zero recomputes the identical deadline.
    const before = catchupDueOn(clock('2026-08-10'), 7);
    const banked = bankCatchupClock(clock('2026-08-10'), '2026-08-10');
    expect(banked).toBe(0);
    expect(catchupDueOn(clock('2026-08-10', banked), 7)).toBe(before);
  });

  it('totals exactly one window across many stints', () => {
    // Three days, park it, four days later. Seven days of window, all spent.
    let used = bankCatchupClock(clock('2026-08-01'), '2026-08-04'); // 3
    const due = catchupDueOn(clock('2026-08-20', used), 7);
    expect(used).toBe(3);
    expect(due).toBe('2026-08-23'); // 20th + (7 - 3 - 1)
    used = bankCatchupClock(clock('2026-08-20', used), '2026-08-24');
    expect(used).toBe(7);
    expect(catchupDaysLeft(clock('2026-08-24', used), 7, '2026-08-24')).toBe(-1);
  });

  it('ignores a clock that appears to run backwards', () => {
    expect(bankCatchupClock(clock('2026-08-10'), '2026-08-07')).toBe(0);
  });
});

describe('catchupDaysSpent and catchupDaysLeft', () => {
  it('counts the running stint as it goes', () => {
    expect(catchupDaysSpent(clock('2026-08-08'), '2026-08-10')).toBe(2);
    expect(catchupDaysSpent(clock(null, 5), '2026-08-10')).toBe(5);
  });

  it('is null with no clock, so nothing can read as late', () => {
    expect(catchupDaysLeft(clock(null), 7, TODAY)).toBeNull();
  });

  it('counts down to zero on the due day, then goes negative', () => {
    expect(catchupDaysLeft(clock('2026-08-10'), 7, '2026-08-10')).toBe(6);
    expect(catchupDaysLeft(clock('2026-08-10'), 7, '2026-08-16')).toBe(0);
    expect(catchupDaysLeft(clock('2026-08-10'), 7, '2026-08-18')).toBe(-2);
  });
});

describe('planCatchupActivation', () => {
  it('just starts when nothing is running', () => {
    const items = [open(), open()];
    expect(planCatchupActivation(items, 1, TODAY)).toEqual({
      deactivateIndex: null,
      deactivateDaysUsed: 0,
      activateOn: TODAY,
    });
  });

  it('banks the running one before starting the new one', () => {
    const items = [open({ clock: clock('2026-08-07') }), open()];
    expect(planCatchupActivation(items, 1, TODAY)).toEqual({
      deactivateIndex: 0,
      deactivateDaysUsed: 3,
      activateOn: TODAY,
    });
  });

  it('does nothing when the target is already the running one', () => {
    // Idempotent. A second press must not restart the window.
    const items = [open({ clock: clock('2026-08-07') })];
    expect(planCatchupActivation(items, 0, TODAY)).toEqual({
      deactivateIndex: null,
      deactivateDaysUsed: 0,
      activateOn: null,
    });
  });
});

describe('diffDaysYmd', () => {
  it('counts whole days in both directions', () => {
    expect(diffDaysYmd('2026-08-01', '2026-08-10')).toBe(9);
    expect(diffDaysYmd('2026-08-10', '2026-08-01')).toBe(-9);
    expect(diffDaysYmd('2026-08-10', '2026-08-10')).toBe(0);
  });

  it('crosses a month and a year boundary', () => {
    expect(diffDaysYmd('2026-07-28', '2026-08-04')).toBe(7);
    expect(diffDaysYmd('2026-12-30', '2027-01-04')).toBe(5);
  });
});

describe('isCatchupClockRunning', () => {
  it('is exactly "has an activation date"', () => {
    expect(isCatchupClockRunning(clock('2026-08-10'))).toBe(true);
    expect(isCatchupClockRunning(clock(null, 6))).toBe(false);
    expect(isCatchupClockRunning(undefined)).toBe(false);
  });
});

describe('day one after deploy', () => {
  it('leaves every existing row waiting, with nothing overdue and no backfill', () => {
    // Every production row takes activated_on = NULL and days_used = 0 from the
    // column defaults. Nobody should be nudged, and nobody should see red.
    const backlog = [open(), open({ chained: false }), open({ kind: 'opted_out' }), cleared()];
    const r = resolveCatchupBacklog(backlog, ctx());
    expect(r.filter((i) => i.overdue)).toHaveLength(0);
    expect(r.filter((i) => i.active)).toHaveLength(0);
    expect(r.filter((i) => i.dueOn !== null)).toHaveLength(0);
    expect(summariseCatchupClock(r).stalled).toBe(true);
  });
});


/**
 * An OPTIONAL class test.
 *
 * A teacher can now attach the test for a class and mark it Optional. When they
 * do, a student who missed that class must not be held on a backlog by a paper
 * their own classmates were told they could skip. The test is still offered; it
 * simply is not what anyone is waiting on.
 */
describe('an optional test blocks nothing', () => {
  const base = {
    kind: 'no_show' as const,
    watched: true,
    assignmentsOutstanding: 0,
    hasTest: true,
    testPassed: false,
  };

  it('finishes the class even though the test is unpassed', () => {
    expect(isCatchupItemComplete({ ...base, testRequired: false })).toBe(true);
    expect(catchupItemStep({ ...base, testRequired: false })).toBe('done');
  });

  it('still blocks when the test is required', () => {
    expect(isCatchupItemComplete({ ...base, testRequired: true })).toBe(false);
    expect(catchupItemStep({ ...base, testRequired: true })).toBe('test');
  });

  it('defaults to required when the caller says nothing', () => {
    // The auto-generated catch-up paper has always been compulsory, so every
    // existing caller has to keep meaning what it meant.
    expect(isCatchupItemComplete(base)).toBe(false);
    expect(catchupItemStep(base)).toBe('test');
  });

  it('does not let an optional test skip the steps before it', () => {
    const notWatched = { ...base, watched: false, testRequired: false };
    expect(catchupItemStep(notWatched)).toBe('watch');
    expect(isCatchupItemComplete(notWatched)).toBe(false);

    const workLeft = { ...base, assignmentsOutstanding: 1, testRequired: false };
    expect(catchupItemStep(workLeft)).toBe('assignment');
  });
});
