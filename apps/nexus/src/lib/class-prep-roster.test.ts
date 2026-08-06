import { describe, it, expect } from 'vitest';
import {
  buildPrepRoster,
  summarisePrepRoster,
  prepRosterHeadline,
  type PrepStateRow,
  type BuildPrepRosterInput,
} from './class-prep-roster';

function student(id: string, name = `Student ${id}`) {
  return { student_id: id, name, avatar_url: null };
}

function state(over: Partial<PrepStateRow> & { student_id: string }): PrepStateRow {
  return {
    test_best_pct: null,
    test_attempts: 0,
    test_passed_at: null,
    assignments_required: 0,
    assignments_submitted: 0,
    unlocked_at: null,
    unlocked_via: null,
    prepared_at_class_start: null,
    blocked_attempts: 0,
    last_blocked_at: null,
    joined_via_nexus_at: null,
    test_reason_code: null,
    test_reason_at: null,
    updated_at: '2026-08-20T12:00:00Z',
    ...over,
  };
}

function input(over: Partial<BuildPrepRosterInput> = {}): BuildPrepRosterInput {
  return {
    students: [student('a')],
    states: [],
    hasTest: true,
    preworkRequired: 0,
    ...over,
  };
}

describe('nobody is accused of something they did not do', () => {
  it('calls a student with no row not_started, never failed', () => {
    // The RSVP dashboard made the same choice: a "failed" bucket for people who
    // have not begun hands the teacher a list to chase that should not exist.
    const rows = buildPrepRoster(input());
    expect(rows[0].status).toBe('not_started');
    expect(rows[0].test_attempts).toBe(0);
  });

  it('separates "has not started" from "tried and failed"', () => {
    const notStarted = buildPrepRoster(
      input({ states: [state({ student_id: 'a' })] }),
    )[0];
    const tried = buildPrepRoster(
      input({ states: [state({ student_id: 'a', test_attempts: 2, test_best_pct: 40 })] }),
    )[0];

    // One needs a nudge, the other needs help with the topic. Same list, different
    // response, so they cannot share a status.
    expect(notStarted.status).toBe('not_started');
    expect(tried.status).toBe('test_pending');
  });

  it('does not read a missing attendance row as "did not attend"', () => {
    // Attendance sync can be late, degraded, or never run at all.
    const rows = buildPrepRoster(
      input({
        states: [state({ student_id: 'a', prepared_at_class_start: false })],
        attendance: new Map(),
      }),
    );
    expect(rows[0].status).not.toBe('attended_unprepared');
  });
});

describe('attended_unprepared is a point-in-time fact', () => {
  it('needs both an attendance row and prepared_at_class_start false', () => {
    const rows = buildPrepRoster(
      input({
        states: [state({ student_id: 'a', prepared_at_class_start: false })],
        attendance: new Map([['a', true]]),
      }),
    );
    expect(rows[0].status).toBe('attended_unprepared');
  });

  it('still reports unprepared for a student who passed AFTER the class', () => {
    // This is the test that proves the observed fact is never recomputed away.
    // Joined at 7pm having failed, passed at 10pm: every derived field now says
    // "done", and the roster must still tell the truth about the class itself.
    const rows = buildPrepRoster(
      input({
        states: [
          state({
            student_id: 'a',
            test_passed_at: '2026-08-20T22:00:00+05:30',
            test_best_pct: 100,
            prepared_at_class_start: false,
          }),
        ],
        attendance: new Map([['a', true]]),
      }),
    );
    expect(rows[0].status).toBe('attended_unprepared');
    expect(rows[0].test_best_pct).toBe(100);
  });

  it('does not flag a student who attended having done the work', () => {
    const rows = buildPrepRoster(
      input({
        states: [
          state({ student_id: 'a', test_passed_at: '2026-08-20T17:00:00+05:30', prepared_at_class_start: true }),
        ],
        attendance: new Map([['a', true]]),
      }),
    );
    expect(rows[0].status).toBe('ready');
  });
});

describe('the ordinary statuses', () => {
  it('is ready when the test is passed and there is no prework', () => {
    const rows = buildPrepRoster(
      input({ states: [state({ student_id: 'a', test_passed_at: '2026-08-20T17:00:00Z' })] }),
    );
    expect(rows[0].status).toBe('ready');
  });

  it('is ready when there is no test and the prework is in', () => {
    const rows = buildPrepRoster(
      input({
        hasTest: false,
        preworkRequired: 2,
        states: [state({ student_id: 'a', assignments_required: 2, assignments_submitted: 2 })],
      }),
    );
    expect(rows[0].status).toBe('ready');
  });

  it('reports test_pending ahead of prework_pending when both are outstanding', () => {
    const rows = buildPrepRoster(
      input({
        preworkRequired: 1,
        states: [
          state({ student_id: 'a', test_attempts: 1, test_best_pct: 30, assignments_required: 1 }),
        ],
      }),
    );
    expect(rows[0].status).toBe('test_pending');
  });

  it('lets a reason outrank the individual blockers', () => {
    // "They told us why" needs a different response from "they have not started",
    // so it cannot be collapsed into the pending bucket.
    const rows = buildPrepRoster(
      input({
        states: [state({ student_id: 'a', test_reason_at: '2026-08-20T16:00:00Z', test_reason_code: 'unwell' })],
      }),
    );
    expect(rows[0].status).toBe('reason_given');
    expect(rows[0].reason_code).toBe('unwell');
  });

  it('surfaces how often a student hit the locked button', () => {
    const rows = buildPrepRoster(
      input({ states: [state({ student_id: 'a', blocked_attempts: 4 })] }),
    );
    expect(rows[0].blocked_attempts).toBe(4);
  });
});

describe('the summary', () => {
  it('reports readyRate null, never 0, for an empty roster', () => {
    const s = summarisePrepRoster([]);
    expect(s.readyRate).toBeNull();
    expect(s.readyRate).not.toBe(0);
    expect(prepRosterHeadline(s)).toBe('Nobody is enrolled in this class yet');
  });

  it('counts each student into exactly one bucket', () => {
    const rows = buildPrepRoster(
      input({
        students: [student('a'), student('b'), student('c'), student('d')],
        preworkRequired: 1,
        states: [
          state({ student_id: 'a', test_passed_at: 'x', assignments_required: 1, assignments_submitted: 1 }),
          state({ student_id: 'b', test_attempts: 1, test_best_pct: 10, assignments_required: 1 }),
          state({ student_id: 'c', test_reason_at: 'x', assignments_required: 1 }),
        ],
      }),
    );
    const s = summarisePrepRoster(rows);
    expect(s.total).toBe(4);
    expect(s.ready + s.pending + s.reasonGiven + s.unprepared).toBe(4);
    expect(s.ready).toBe(1);
    expect(s.reasonGiven).toBe(1);
    // b failed the test, d has no row at all.
    expect(s.pending).toBe(2);
    expect(s.readyRate).toBeCloseTo(0.25);
  });

  it('phrases the headline the way a teacher would say it', () => {
    const rows = buildPrepRoster(
      input({
        students: [student('a'), student('b')],
        states: [state({ student_id: 'a', test_passed_at: 'x' })],
      }),
    );
    expect(prepRosterHeadline(summarisePrepRoster(rows))).toBe('1 ready, 1 to go');
  });

  it('omits buckets that are empty rather than printing zeroes', () => {
    const rows = buildPrepRoster(
      input({ states: [state({ student_id: 'a', test_passed_at: 'x' })] }),
    );
    const headline = prepRosterHeadline(summarisePrepRoster(rows));
    expect(headline).toBe('1 ready');
    expect(headline).not.toContain('0');
  });
});

/**
 * The after-class test, on the same roster.
 *
 * The rule being protected here is that "to go" keeps meaning what it meant. Ten
 * minutes before a class, "28 to go" tells a teacher twenty-eight people are
 * about to arrive unprepared. If the same number could also mean "have not done
 * the follow-up test yet", the number stops being worth reading.
 */
describe('the class test never masks the pre-class question', () => {
  const passed = () => new Map([['a', { best_pct: 90, attempts: 1, passed: true }]]);
  const failed = () => new Map([['a', { best_pct: 30, attempts: 2, passed: false }]]);

  it('is only reached once everything asked BEFORE the class is done', () => {
    const rows = buildPrepRoster(
      input({
        // Prep test outstanding AND the class test outstanding.
        states: [state({ student_id: 'a', test_attempts: 1, test_best_pct: 40 })],
        hasClassTest: true,
        classTest: failed(),
      }),
    );
    // The pre-class blocker wins, because that is the one that decides whether
    // they walk into tonight's class ready.
    expect(rows[0].status).toBe('test_pending');
  });

  it('reports the class test once the prep half is settled', () => {
    const rows = buildPrepRoster(
      input({
        states: [state({ student_id: 'a', test_passed_at: 'x' })],
        hasClassTest: true,
        classTest: failed(),
      }),
    );
    expect(rows[0].status).toBe('class_test_pending');
    expect(rows[0].class_test_attempts).toBe(2);
    expect(rows[0].class_test_best_pct).toBe(30);
  });

  it('is ready once both are cleared', () => {
    const rows = buildPrepRoster(
      input({
        states: [state({ student_id: 'a', test_passed_at: 'x' })],
        hasClassTest: true,
        classTest: passed(),
      }),
    );
    expect(rows[0].status).toBe('ready');
  });

  it('does not call a student "not started" over work that was never set', () => {
    // A class whose ONLY requirement is the test it set for afterwards has no
    // pre-class state row to find. Reading that absence as "not started" would
    // report on prework nobody was asked for.
    const rows = buildPrepRoster(
      input({ hasTest: false, preworkRequired: 0, hasClassTest: true, classTest: failed() }),
    );
    expect(rows[0].status).toBe('class_test_pending');
  });

  it('counts it apart from "to go", and says so in the headline', () => {
    const rows = buildPrepRoster(
      input({
        students: [student('a'), student('b')],
        states: [state({ student_id: 'a', test_passed_at: 'x' })],
        hasClassTest: true,
        classTest: failed(),
      }),
    );
    const summary = summarisePrepRoster(rows);
    expect(summary.classTestPending).toBe(1);
    // 'b' has no row at all, so they are still the pre-class problem.
    expect(summary.pending).toBe(1);
    expect(prepRosterHeadline(summary)).toBe('0 ready, 1 to go, 1 owe the test');
  });

  it('changes nothing at all on a class with no class test', () => {
    const rows = buildPrepRoster(
      input({ states: [state({ student_id: 'a', test_passed_at: 'x' })] }),
    );
    expect(rows[0].status).toBe('ready');
    expect(rows[0].class_test_passed).toBe(false);
    expect(summarisePrepRoster(rows).classTestPending).toBe(0);
  });
});
