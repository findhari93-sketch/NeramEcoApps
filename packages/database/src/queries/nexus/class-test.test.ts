import { describe, it, expect } from 'vitest';
import {
  attachClassTest,
  detachClassTest,
  getClassTest,
  getClassTestRoster,
  loadPassedClassTests,
  updateClassTest,
  CLASS_TEST_MAX_QUESTIONS,
} from './class-test';
import { createFakeDb } from './testing/fake-supabase';

/**
 * The test a class sets for afterwards.
 *
 * Three things are worth a test here, and all three are places this feature can
 * fail silently rather than loudly:
 *
 *   1. Re-placing the SAME paper on the SAME class. nexus_test_placements carries
 *      two uniqueness rules and only one is partial, so deactivate-then-insert
 *      throws 23505 on an ordinary teacher action. The row has to be revived.
 *   2. Required versus Optional. An optional test must not be able to hold
 *      anything shut, and the default when the field is absent must be Required.
 *   3. The deadline. It is soft and it lives in gating, never in available_until,
 *      because the take engine refuses a placement whose available_until has
 *      passed and a late student would be locked out of the very paper we are
 *      reminding them to finish.
 */

const CLASS = 'class-1';
const CLASSROOM = 'classroom-1';
/** 7pm IST. */
const CLASS_START = '2026-08-20T13:30:00.000Z';

function seed(over: Record<string, any[]> = {}) {
  return createFakeDb(
    {
      nexus_test_placements: [],
      nexus_tests: [],
      nexus_test_questions: [],
      nexus_test_attempts: [],
      nexus_class_test_reminders: [],
      nexus_qb_questions: [
        { id: 'q1', question_format: 'MCQ', is_active: true },
        { id: 'q2', question_format: 'MCQ', is_active: true },
        { id: 'q3', question_format: 'NUMERICAL', is_active: true },
      ],
      ...over,
    },
    // The column defaults Postgres fills in and the inserts deliberately omit.
    // Without these, a row created here is invisible to every read that filters
    // on is_active, which is all of them.
    {
      nexus_test_placements: { is_active: true, is_visible: true, available_until: null },
      nexus_tests: { is_active: true },
    },
  );
}

describe('attachClassTest: setting the paper', () => {
  it('composes a paper, places it on the class, and reads it back', async () => {
    const db = seed();
    const info = await attachClassTest(
      {
        scheduledClassId: CLASS,
        classroomId: CLASSROOM,
        questionIds: ['q1', 'q2', 'q3'],
        title: 'Orthographic projection',
        passingPct: 60,
        classDateIso: CLASS_START,
      },
      db.client,
    );

    expect(info.title).toBe('Orthographic projection');
    expect(info.question_count).toBe(3);
    expect(info.required).toBe(true);
    expect(db.tables.nexus_test_placements).toHaveLength(1);
    expect(db.tables.nexus_test_placements[0].context_type).toBe('class_test');
  });

  it('never sets available_until, so a late student is not locked out', async () => {
    const db = seed();
    await attachClassTest(
      {
        scheduledClassId: CLASS,
        classroomId: CLASSROOM,
        questionIds: ['q1'],
        classDateIso: CLASS_START,
      },
      db.client,
    );

    const placement = db.tables.nexus_test_placements[0];
    // The whole reason the deadline lives in gating. api/tests/attempt refuses a
    // placement whose available_until has passed, and a required class test has
    // to stay clearable from a catch-up backlog weeks later.
    expect(placement.available_until).toBeNull();
    expect(placement.gating.due_at).toBeTruthy();
  });

  it('defaults the deadline to three days after the class', async () => {
    const db = seed();
    const info = await attachClassTest(
      {
        scheduledClassId: CLASS,
        classroomId: CLASSROOM,
        questionIds: ['q1'],
        classDateIso: CLASS_START,
      },
      db.client,
    );
    expect(info.due_at).toBe('2026-08-23T13:30:00.000Z');
  });

  it('treats an explicit null deadline as "no deadline", not as "use the default"', async () => {
    const db = seed();
    const info = await attachClassTest(
      {
        scheduledClassId: CLASS,
        classroomId: CLASSROOM,
        questionIds: ['q1'],
        dueAt: null,
        classDateIso: CLASS_START,
      },
      db.client,
    );
    expect(info.due_at).toBeNull();
  });

  it('carries Optional through to the placement', async () => {
    const db = seed();
    const info = await attachClassTest(
      {
        scheduledClassId: CLASS,
        classroomId: CLASSROOM,
        questionIds: ['q1'],
        required: false,
        classDateIso: CLASS_START,
      },
      db.client,
    );
    expect(info.required).toBe(false);
  });

  it('reads a placement with no gating at all as Required', async () => {
    // A row written by hand, or before this field existed. Erring towards "asked
    // for" is the safer default: the alternative silently drops a paper a teacher
    // believes they set.
    const db = seed({
      nexus_test_placements: [
        {
          id: 'p-legacy',
          test_id: 't-legacy',
          context_type: 'class_test',
          context_id: CLASS,
          passing_pct: 60,
          gating: {},
          is_active: true,
        },
      ],
      nexus_tests: [{ id: 't-legacy', title: 'Legacy', total_marks: 4, is_published: true }],
      nexus_test_questions: [
        { id: 'tq1', test_id: 't-legacy' },
        { id: 'tq2', test_id: 't-legacy' },
        { id: 'tq3', test_id: 't-legacy' },
        { id: 'tq4', test_id: 't-legacy' },
      ],
    });

    const info = await getClassTest(CLASS, db.client);
    expect(info?.required).toBe(true);
    expect(info?.due_at).toBeNull();
  });

  it('states the pass mark as a count, and warns on a short paper', async () => {
    const db = seed();
    const info = await attachClassTest(
      {
        scheduledClassId: CLASS,
        classroomId: CLASSROOM,
        questionIds: ['q1', 'q2', 'q3'],
        passingPct: 80,
        classDateIso: CLASS_START,
      },
      db.client,
    );
    // 80% of 3 is "get all three right", which is not what a teacher setting 80%
    // pictures. Reusing prepPassSummary is what makes both halves say so.
    expect(info.must_get_right).toBe(3);
    expect(info.warning).toContain('3 of them right');
  });

  it('refuses a question the grader cannot mark', async () => {
    const db = seed({
      nexus_qb_questions: [{ id: 'draw', question_format: 'DRAWING', is_active: true }],
    });
    await expect(
      attachClassTest(
        { scheduledClassId: CLASS, classroomId: CLASSROOM, questionIds: ['draw'] },
        db.client,
      ),
    ).rejects.toThrow(/MCQ or numerical/);
  });

  it('refuses a paper larger than the ceiling it advertises', async () => {
    const db = seed();
    const tooMany = Array.from({ length: CLASS_TEST_MAX_QUESTIONS + 1 }, (_, i) => `q-${i}`);
    await expect(
      attachClassTest(
        { scheduledClassId: CLASS, classroomId: CLASSROOM, questionIds: tooMany },
        db.client,
      ),
    ).rejects.toThrow(/tops out at/);
  });

  it('refuses to reuse a paper that gates another class', async () => {
    const db = seed({
      nexus_tests: [{ id: 't-prep', title: 'Prep paper', test_kind: 'class_prep' }],
    });
    // Converting it, as the prep route does with the kinds it accepts, would
    // unlock the door of the class it is gating as a side effect of reusing it.
    await expect(
      attachClassTest(
        { scheduledClassId: CLASS, classroomId: CLASSROOM, testId: 't-prep' },
        db.client,
      ),
    ).rejects.toThrow(/belongs to another class/);
  });
});

describe('attachClassTest: the dual-uniqueness trap', () => {
  it('revives the existing placement when the same paper is set again', async () => {
    const db = seed({
      nexus_test_placements: [
        {
          id: 'p1',
          test_id: 't1',
          context_type: 'class_test',
          context_id: CLASS,
          passing_pct: 60,
          gating: { required: true, due_at: null },
          // Detached earlier, exactly as a teacher who changed their mind leaves it.
          is_active: false,
          is_visible: false,
        },
      ],
      nexus_tests: [{ id: 't1', title: 'Paper one', total_marks: 2, is_published: true, test_kind: 'classroom_assigned' }],
      nexus_test_questions: [
        { id: 'tq1', test_id: 't1' },
        { id: 'tq2', test_id: 't1' },
      ],
    });

    await attachClassTest(
      { scheduledClassId: CLASS, classroomId: CLASSROOM, testId: 't1', passingPct: 70 },
      db.client,
    );

    // uq_placement_test_context has no `WHERE is_active` predicate, so the
    // deactivated row still owns its (context_type, context_id, test_id) triple
    // forever. A second row here is a 23505 in production.
    expect(db.tables.nexus_test_placements).toHaveLength(1);
    expect(db.tables.nexus_test_placements[0].id).toBe('p1');
    expect(db.tables.nexus_test_placements[0].is_active).toBe(true);
    expect(db.tables.nexus_test_placements[0].passing_pct).toBe(70);
  });

  it('deactivates the old paper when a DIFFERENT one is set', async () => {
    const db = seed({
      nexus_test_placements: [
        {
          id: 'p1',
          test_id: 't1',
          context_type: 'class_test',
          context_id: CLASS,
          passing_pct: 60,
          gating: { required: true, due_at: null },
          is_active: true,
        },
      ],
      nexus_tests: [
        { id: 't1', title: 'Paper one', total_marks: 1, is_published: true, test_kind: 'classroom_assigned' },
        { id: 't2', title: 'Paper two', total_marks: 1, is_published: true, test_kind: 'classroom_assigned' },
      ],
      nexus_test_questions: [
        { id: 'tq1', test_id: 't1' },
        { id: 'tq2', test_id: 't2' },
      ],
    });

    const info = await attachClassTest(
      { scheduledClassId: CLASS, classroomId: CLASSROOM, testId: 't2' },
      db.client,
    );

    expect(info.title).toBe('Paper two');
    expect(db.tables.nexus_test_placements.find((p: any) => p.id === 'p1').is_active).toBe(false);
    // One ACTIVE placement, which is what the partial unique index enforces.
    expect(db.tables.nexus_test_placements.filter((p: any) => p.is_active)).toHaveLength(1);
  });
});

describe('updateClassTest: changing the terms, not the paper', () => {
  function seeded() {
    return seed({
      nexus_test_placements: [
        {
          id: 'p1',
          test_id: 't1',
          context_type: 'class_test',
          context_id: CLASS,
          passing_pct: 60,
          gating: { required: true, due_at: '2026-08-23T18:29:00.000Z' },
          is_active: true,
        },
      ],
      nexus_tests: [{ id: 't1', title: 'Paper', total_marks: 10, is_published: true }],
      nexus_test_questions: Array.from({ length: 10 }, (_, i) => ({ id: `tq${i}`, test_id: 't1' })),
    });
  }

  it('keeps the deadline when only Required is changed', async () => {
    const db = seeded();
    const info = await updateClassTest(CLASS, { required: false }, db.client);
    // jsonb has no partial update through PostgREST, so patching one key by
    // sending only that key silently drops the other.
    expect(info?.required).toBe(false);
    expect(info?.due_at).toBe('2026-08-23T18:29:00.000Z');
  });

  it('keeps Required when only the deadline is changed', async () => {
    const db = seeded();
    const info = await updateClassTest(CLASS, { dueAt: '2026-08-25T18:29:00.000Z' }, db.client);
    expect(info?.required).toBe(true);
    expect(info?.due_at).toBe('2026-08-25T18:29:00.000Z');
  });

  it('drops an unreadable date rather than storing it', async () => {
    const db = seeded();
    const info = await updateClassTest(CLASS, { dueAt: 'next tuesday' }, db.client);
    expect(info?.due_at).toBeNull();
  });

  it('answers null when the class has no test', async () => {
    const db = seed();
    expect(await updateClassTest(CLASS, { required: false }, db.client)).toBeNull();
  });
});

describe('detachClassTest', () => {
  it('deactivates the placement and leaves the paper alone', async () => {
    const db = seed({
      nexus_test_placements: [
        {
          id: 'p1',
          test_id: 't1',
          context_type: 'class_test',
          context_id: CLASS,
          passing_pct: 60,
          gating: {},
          is_active: true,
        },
      ],
      nexus_tests: [{ id: 't1', title: 'Paper', total_marks: 1, is_published: true }],
    });

    await detachClassTest(CLASS, db.client);

    expect(await getClassTest(CLASS, db.client)).toBeNull();
    // A teacher who detaches by mistake must lose nothing.
    expect(db.tables.nexus_tests).toHaveLength(1);
    expect(db.tables.nexus_test_placements).toHaveLength(1);
  });
});

describe('getClassTestRoster: who has done it', () => {
  function withAttempts(attempts: any[]) {
    return seed({
      nexus_test_placements: [
        {
          id: 'p1',
          test_id: 't1',
          context_type: 'class_test',
          context_id: CLASS,
          passing_pct: 60,
          gating: { required: true, due_at: null },
          is_active: true,
        },
      ],
      nexus_tests: [{ id: 't1', title: 'Paper', total_marks: 10, is_published: true }],
      nexus_test_questions: Array.from({ length: 10 }, (_, i) => ({ id: `tq${i}`, test_id: 't1' })),
      nexus_test_attempts: attempts,
    });
  }

  const attempt = (over: Record<string, unknown> = {}) => ({
    id: `a-${Math.round(Number(over.percentage) || 0)}`,
    test_id: 't1',
    student_id: 's1',
    mode: 'official',
    status: 'submitted',
    percentage: 50,
    submitted_at: '2026-08-21T10:00:00.000Z',
    ...over,
  });

  it('reports the best score and the FIRST pass', async () => {
    const db = withAttempts([
      attempt({ id: 'a1', percentage: 40, submitted_at: '2026-08-21T10:00:00.000Z' }),
      attempt({ id: 'a2', percentage: 70, submitted_at: '2026-08-21T11:00:00.000Z' }),
      attempt({ id: 'a3', percentage: 90, submitted_at: '2026-08-21T12:00:00.000Z' }),
    ]);
    const roster = await getClassTestRoster(CLASS, ['s1'], db.client);
    const row = roster.get('s1');
    expect(row?.best_pct).toBe(90);
    expect(row?.attempts).toBe(3);
    // The first clearing attempt, so the timestamp is stable once set.
    expect(row?.passed_at).toBe('2026-08-21T11:00:00.000Z');
  });

  it('ignores practice sittings and unsubmitted attempts', async () => {
    const db = withAttempts([
      attempt({ id: 'a1', percentage: 95, mode: 'practice' }),
      attempt({ id: 'a2', percentage: 95, status: 'in_progress' }),
    ]);
    const roster = await getClassTestRoster(CLASS, ['s1'], db.client);
    // Neither counts, so this student has not sat it at all.
    expect(roster.get('s1')).toBeUndefined();
  });

  it('leaves a student who fell short unpassed but recorded', async () => {
    const db = withAttempts([attempt({ percentage: 55 })]);
    const row = (await getClassTestRoster(CLASS, ['s1'], db.client)).get('s1');
    expect(row?.best_pct).toBe(55);
    expect(row?.passed_at).toBeNull();
  });

  it('is empty when the class has no test', async () => {
    const db = seed();
    expect((await getClassTestRoster(CLASS, ['s1'], db.client)).size).toBe(0);
  });
});

describe('a failed query is never reported as "no test"', () => {
  /** Every read fails, the way PostgREST answers a filter on an unknown enum. */
  function brokenClient(message: string) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      range: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: null, error: { message } }),
      single: async () => ({ data: null, error: { message } }),
      then: (resolve: any) => resolve({ data: null, error: { message } }),
    };
    return { from: () => chain } as any;
  }

  it('throws rather than answering null', async () => {
    // Found by running this against staging, where the migration had not landed:
    // the route answered 200 with class_test: null, so the feature read as
    // "shipped but does nothing" instead of "the database is behind". A teacher
    // would set a paper, watch the slot stay empty, and have nothing to report.
    const broken = brokenClient('invalid input value for enum nexus_placement_context: "class_test"');
    await expect(getClassTest(CLASS, broken)).rejects.toMatchObject({
      message: expect.stringContaining('nexus_placement_context'),
    });
  });

  it('throws rather than reporting that nobody has passed', async () => {
    const db = seed({
      nexus_test_placements: [
        {
          id: 'p1',
          test_id: 't1',
          context_type: 'class_test',
          context_id: CLASS,
          passing_pct: 60,
          gating: {},
          is_active: true,
        },
      ],
      nexus_tests: [{ id: 't1', title: 'Paper', total_marks: 1, is_published: true }],
    });

    // The placement reads fine; only the attempts read fails. Answering "nobody
    // passed" would chase a class that has already done the work.
    const original = db.client.from;
    db.client.from = (table: string) =>
      table === 'nexus_test_attempts'
        ? brokenClient('connection reset').from()
        : original(table);

    await expect(getClassTestRoster(CLASS, ['s1'], db.client)).rejects.toBeTruthy();
  });
});

describe('loadPassedClassTests', () => {
  it('counts only attempts that cleared each paper own bar', async () => {
    const db = seed({
      nexus_test_attempts: [
        { id: 'a1', test_id: 't1', student_id: 's1', mode: 'official', status: 'submitted', percentage: 65 },
        { id: 'a2', test_id: 't2', student_id: 's1', mode: 'official', status: 'submitted', percentage: 65 },
      ],
    });
    const passed = await loadPassedClassTests(
      's1',
      [
        { test_id: 't1', passing_pct: 60 },
        { test_id: 't2', passing_pct: 80 },
      ],
      db.client,
    );
    expect(passed.has('t1')).toBe(true);
    expect(passed.has('t2')).toBe(false);
  });

  it('is empty rather than throwing when nothing was placed', async () => {
    const db = seed();
    expect((await loadPassedClassTests('s1', [], db.client)).size).toBe(0);
  });
});
