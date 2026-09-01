import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KINDS,
  assignedRunHasDate,
  buildConductedRuns,
  classifyConducted,
  parseIncludeParam,
  resolveRunDate,
  tallyAttempts,
  type ConductedRunInput,
} from './conducted-runs';

/**
 * The record of what a class has sat.
 *
 * Written against real production rows: paper acf8084d "History of Architecture
 * Test" carries a study_file placement AND an exam placement, and the exam
 * (16 sat, 11 passed at 80, 36 enrolled, results unpublished) is the run a
 * teacher was unable to reach from anywhere in the Tests hub.
 */

const run = (over: Partial<ConductedRunInput> = {}): ConductedRunInput => ({
  placement_id: 'p-1',
  test_id: 't-1',
  paper_title: 'History of Architecture Test',
  context_type: 'exam',
  class_title: 'History of Architecture Test',
  class_date: '2026-08-18',
  classroom_name: 'JEE B.Arch Session 1',
  opens_at: '2026-08-18T08:30:00Z',
  closes_at: '2026-08-18T17:15:00Z',
  due_at: null,
  passing_pct: 80,
  results_state: 'unpublished',
  ...over,
});

describe('classifyConducted', () => {
  it('names the five ways a paper reaches a class', () => {
    expect(classifyConducted('exam')).toBe('exam');
    expect(classifyConducted('class_test')).toBe('class_test');
    expect(classifyConducted('classroom_assignment')).toBe('assigned');
    expect(classifyConducted('catchup_class')).toBe('catchup');
    expect(classifyConducted('class_prep_test')).toBe('prep');
  });

  /**
   * The whole point of the filter. A chapter test and a practice pool are open
   * to everyone forever; they were never conducted on a date, so a chronological
   * record of them would be answering a different question.
   */
  it('rejects the always-open contexts rather than inventing a date for them', () => {
    for (const ctx of [
      'study_file',
      'student_practice',
      'class_recap_section',
      'foundation_section',
      'module_item',
      'qb_paper',
      null,
      undefined,
    ]) {
      expect(classifyConducted(ctx)).toBeNull();
    }
  });
});

describe('resolveRunDate', () => {
  it('prefers when students actually sat it', () => {
    expect(
      resolveRunDate({
        opens_at: '2026-08-18T08:30:00Z',
        due_at: '2026-08-21T00:00:00Z',
        closes_at: '2026-08-18T17:15:00Z',
        class_date: '2026-08-01',
      }),
    ).toBe('2026-08-18T08:30:00Z');
  });

  /** A soft class test writes due_at and nothing else. */
  it('falls back to the due date, then to the close', () => {
    expect(resolveRunDate({ due_at: '2026-08-21T00:00:00Z', closes_at: '2026-08-30T00:00:00Z' })).toBe(
      '2026-08-21T00:00:00Z',
    );
    expect(resolveRunDate({ closes_at: '2026-08-30T00:00:00Z' })).toBe('2026-08-30T00:00:00Z');
  });

  /**
   * A bare YYYY-MM-DD parses as midnight UTC, which is 05:30 IST the same day
   * but renders as the PREVIOUS day for anyone formatting in another zone. The
   * date is pinned to IST midnight so a class on the 18th never reads as the 17th.
   */
  it('pins a bare class date to IST midnight', () => {
    const at = resolveRunDate({ class_date: '2026-08-18' });
    expect(at).toBe('2026-08-18T00:00:00+05:30');
    expect(new Date(at!).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }))
      .toBe('18 Aug');
  });

  it('returns null rather than an invalid date when nothing carries one', () => {
    expect(resolveRunDate({})).toBeNull();
    expect(resolveRunDate({ opens_at: 'not a date' })).toBeNull();
  });
});

describe('assignedRunHasDate', () => {
  it('accepts an assigned paper with a deadline and refuses one without', () => {
    expect(assignedRunHasDate({ closes_at: '2026-08-21T00:00:00Z' })).toBe(true);
    expect(assignedRunHasDate({ due_at: '2026-08-21T00:00:00Z' })).toBe(true);
    expect(assignedRunHasDate({ closes_at: null, due_at: null })).toBe(false);
  });
});

describe('buildConductedRuns', () => {
  it('shapes the real exam row, counts and all', () => {
    const [row] = buildConductedRuns({
      inputs: [run()],
      tallies: { 'p-1': { students_sat: 16, attempts: 16, passed: 11 } },
      enrolled: 36,
    });

    expect(row.kind).toBe('exam');
    expect(row.title).toBe('History of Architecture Test');
    expect(row.students_sat).toBe(16);
    expect(row.passed).toBe(11);
    expect(row.enrolled).toBe(36);
    expect(row.results_unpublished).toBe(true);
    expect(row.href).toBe('/teacher/tests/t-1?tab=results&placement_id=p-1');
  });

  /**
   * The other half of the question. A class that ignored the paper is exactly
   * what a teacher opens this screen to find, so a run nobody sat must survive.
   */
  it('keeps a run nobody has sat', () => {
    const rows = buildConductedRuns({
      inputs: [run()],
      tallies: {},
      enrolled: 36,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].students_sat).toBe(0);
    expect(rows[0].attempts).toBe(0);
  });

  it('sorts newest first across kinds, undated last', () => {
    const rows = buildConductedRuns({
      inputs: [
        run({ placement_id: 'old', context_type: 'class_test', opens_at: null, due_at: '2026-08-02T00:00:00Z' }),
        run({ placement_id: 'new', opens_at: '2026-08-18T08:30:00Z' }),
        run({ placement_id: 'mid', context_type: 'class_test', opens_at: null, due_at: '2026-08-10T00:00:00Z' }),
        run({
          placement_id: 'undated',
          context_type: 'class_test',
          opens_at: null,
          due_at: null,
          closes_at: null,
          class_date: null,
        }),
      ],
      tallies: {},
      enrolled: 36,
    });
    expect(rows.map((r) => r.placement_id)).toEqual(['new', 'mid', 'old', 'undated']);
  });

  it('leaves out catch-up and prep unless they are asked for', () => {
    const inputs = [
      run(),
      run({ placement_id: 'p-2', context_type: 'catchup_class', paper_title: 'Islamic Architecture: class test' }),
      run({ placement_id: 'p-3', context_type: 'class_prep_test' }),
    ];

    expect(buildConductedRuns({ inputs, tallies: {}, enrolled: 36 }).map((r) => r.kind)).toEqual(['exam']);

    const withCatchup = buildConductedRuns({ inputs, tallies: {}, enrolled: 36, include: ['exam', 'catchup'] });
    expect(withCatchup.map((r) => r.kind).sort()).toEqual(['catchup', 'exam']);
  });

  /** An always-open assign has no moment to file it under. */
  it('drops an assigned run with no deadline and keeps one with a date', () => {
    const rows = buildConductedRuns({
      inputs: [
        run({
          placement_id: 'open',
          context_type: 'classroom_assignment',
          opens_at: null,
          closes_at: null,
          due_at: null,
          class_date: null,
        }),
        run({
          placement_id: 'dated',
          context_type: 'classroom_assignment',
          opens_at: null,
          closes_at: '2026-08-21T00:00:00Z',
          due_at: null,
        }),
      ],
      tallies: {},
      enrolled: 36,
      include: ['assigned'],
    });
    expect(rows.map((r) => r.placement_id)).toEqual(['dated']);
  });

  it('never drops the always-open contexts into the list', () => {
    const rows = buildConductedRuns({
      inputs: [
        run({ placement_id: 'chapter', context_type: 'study_file' }),
        run({ placement_id: 'pool', context_type: 'student_practice' }),
      ],
      tallies: {},
      enrolled: 36,
      include: ['exam', 'class_test', 'assigned', 'catchup', 'prep'],
    });
    expect(rows).toEqual([]);
  });

  /** Only an exam holds answers back. Flagging a class test would invent a problem. */
  it('flags unpublished results for an exam and never for anything else', () => {
    const [exam] = buildConductedRuns({ inputs: [run()], tallies: {}, enrolled: 36 });
    expect(exam.results_unpublished).toBe(true);

    const [ct] = buildConductedRuns({
      inputs: [run({ context_type: 'class_test', results_state: 'unpublished' })],
      tallies: {},
      enrolled: 36,
    });
    expect(ct.results_unpublished).toBe(false);
  });

  it('holds a stable order when two runs share a date', () => {
    const inputs = [run({ placement_id: 'bbb' }), run({ placement_id: 'aaa' })];
    const once = buildConductedRuns({ inputs, tallies: {}, enrolled: 36 });
    const twice = buildConductedRuns({ inputs: [...inputs].reverse(), tallies: {}, enrolled: 36 });
    expect(once.map((r) => r.placement_id)).toEqual(twice.map((r) => r.placement_id));
  });
});

describe('tallyAttempts', () => {
  /**
   * A student who scrapes the bar on their fourth try passed once. Counting
   * attempts here would let `passed` exceed the number who sat it.
   */
  it('counts distinct students, not attempts, on both counters', () => {
    const out = tallyAttempts(
      [
        { placement_id: 'p-1', student_id: 's-1', percentage: 40 },
        { placement_id: 'p-1', student_id: 's-1', percentage: 85 },
        { placement_id: 'p-1', student_id: 's-1', percentage: 90 },
        { placement_id: 'p-1', student_id: 's-2', percentage: 30 },
      ],
      { 'p-1': 80 },
    );
    expect(out['p-1']).toEqual({ students_sat: 2, attempts: 4, passed: 1 });
  });

  /**
   * The same paper is routinely practice at 70 and an exam at 80. Reading the
   * paper's bar instead of the run's would report the wrong pass count for one.
   */
  it('marks each run against its own pass mark', () => {
    const rows = [
      { placement_id: 'exam', student_id: 's-1', percentage: 75 },
      { placement_id: 'practice', student_id: 's-1', percentage: 75 },
    ];
    const out = tallyAttempts(rows, { exam: 80, practice: 70 });
    expect(out.exam.passed).toBe(0);
    expect(out.practice.passed).toBe(1);
  });

  it('ignores attempts with no placement rather than crediting them somewhere', () => {
    const out = tallyAttempts(
      [
        { placement_id: null, student_id: 's-1', percentage: 90 },
        { placement_id: 'p-1', student_id: 's-1', percentage: 90 },
      ],
      { 'p-1': 80 },
    );
    expect(Object.keys(out)).toEqual(['p-1']);
    expect(out['p-1'].attempts).toBe(1);
  });

  it('counts nobody as passed when the run has no pass mark', () => {
    const out = tallyAttempts([{ placement_id: 'p-1', student_id: 's-1', percentage: 100 }], { 'p-1': null });
    expect(out['p-1']).toEqual({ students_sat: 1, attempts: 1, passed: 0 });
  });

  it('treats a null percentage as not passed rather than as zero-and-counted', () => {
    const out = tallyAttempts([{ placement_id: 'p-1', student_id: 's-1', percentage: null }], { 'p-1': 80 });
    expect(out['p-1']).toEqual({ students_sat: 1, attempts: 1, passed: 0 });
  });

  /**
   * percentage is NUMERIC, and PostgREST sends NUMERIC as a string. A string
   * compared with >= against a number coerces and happens to work; a string
   * compared against another string compares lexically, and "9" > "85" would
   * quietly mark a fail as a pass.
   */
  it('reads a percentage that arrived as a string', () => {
    const out = tallyAttempts(
      [
        { placement_id: 'p-1', student_id: 's-1', percentage: '85.00' },
        { placement_id: 'p-1', student_id: 's-2', percentage: '9.00' },
      ],
      { 'p-1': 80 },
    );
    expect(out['p-1']).toEqual({ students_sat: 2, attempts: 2, passed: 1 });
  });
});

describe('parseIncludeParam', () => {
  it('defaults to the conducted kinds', () => {
    expect(parseIncludeParam(null)).toEqual(DEFAULT_KINDS);
    expect(parseIncludeParam('')).toEqual(DEFAULT_KINDS);
  });

  it('reads a list and ignores anything it does not recognise', () => {
    expect(parseIncludeParam('exam,catchup')).toEqual(['exam', 'catchup']);
    expect(parseIncludeParam(' exam , prep ')).toEqual(['exam', 'prep']);
  });

  /** A junk parameter must not empty the screen. */
  it('falls back to the default when nothing in the list is valid', () => {
    expect(parseIncludeParam('nonsense,;drop')).toEqual(DEFAULT_KINDS);
  });
});
