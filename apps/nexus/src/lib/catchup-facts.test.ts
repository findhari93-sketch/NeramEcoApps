import { describe, it, expect } from 'vitest';
import { loadClassFactsForStudents } from './catchup-facts';

interface Rows {
  nexus_class_recaps: any[];
  nexus_class_assignments: any[];
  nexus_test_placements: any[];
  nexus_class_recap_progress: any[];
  nexus_assignment_submissions: any[];
  drawing_submissions: any[];
}

/**
 * A Supabase stand-in that applies the filters the real one would, and counts how many
 * queries were issued. The count is the point of the whole change, so it is asserted.
 */
function fakeSupabase(rows: Partial<Rows>) {
  let queries = 0;

  const api = {
    get queries() {
      return queries;
    },
    from(table: string) {
      queries += 1;
      let data: any[] = (rows as any)[table] || [];

      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          data = data.filter((r) => r[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          data = data.filter((r) => vals.includes(r[col]));
          return builder;
        },
        // Awaiting the builder resolves it, exactly as PostgREST's thenable does.
        then: (resolve: (v: { data: any[] }) => unknown) => resolve({ data }),
      };
      return builder;
    },
  };

  return api;
}

const CLASSES = { a: 'class-a', b: 'class-b' };

const baseRows: Partial<Rows> = {
  nexus_class_recaps: [
    { id: 'recap-a', scheduled_class_id: CLASSES.a, status: 'published' },
    { id: 'recap-draft', scheduled_class_id: CLASSES.b, status: 'draft' },
  ],
  nexus_class_assignments: [
    { id: 'asg-a', scheduled_class_id: CLASSES.a, status: 'published' },
    { id: 'asg-b', scheduled_class_id: CLASSES.b, status: 'published' },
  ],
  nexus_test_placements: [
    {
      id: 'place-a',
      test_id: 'test-1',
      context_id: CLASSES.a,
      passing_pct: 60,
      context_type: 'catchup_class',
      is_active: true,
    },
  ],
  nexus_class_recap_progress: [
    { recap_id: 'recap-a', student_id: 's1', status: 'completed' },
    { recap_id: 'recap-a', student_id: 's2', status: 'in_progress' },
  ],
  nexus_assignment_submissions: [{ assignment_id: 'asg-a', student_id: 's1' }],
  drawing_submissions: [{ assignment_id: 'asg-b', student_id: 's2' }],
};

describe('loadClassFactsForStudents', () => {
  it('keeps each student completed recaps to themselves', async () => {
    const db = fakeSupabase(baseRows);

    const facts = await loadClassFactsForStudents(
      db,
      new Map([
        ['s1', [CLASSES.a, CLASSES.b]],
        ['s2', [CLASSES.a, CLASSES.b]],
      ]),
    );

    expect([...facts.get('s1')!.completedRecaps]).toEqual(['recap-a']);
    // s2's row is 'in_progress', so it must not count as completed.
    expect([...facts.get('s2')!.completedRecaps]).toEqual([]);
  });

  it('keeps each student submissions to themselves, across both submission tables', async () => {
    const db = fakeSupabase(baseRows);

    const facts = await loadClassFactsForStudents(
      db,
      new Map([
        ['s1', [CLASSES.a, CLASSES.b]],
        ['s2', [CLASSES.a, CLASSES.b]],
      ]),
    );

    expect([...facts.get('s1')!.submitted]).toEqual(['asg-a']);
    expect([...facts.get('s2')!.submitted]).toEqual(['asg-b']);
  });

  it('shares the class-level facts, which are the same for everyone', async () => {
    const db = fakeSupabase(baseRows);

    const facts = await loadClassFactsForStudents(
      db,
      new Map([
        ['s1', [CLASSES.a]],
        ['s2', [CLASSES.a]],
      ]),
    );

    expect(facts.get('s1')!.recapByClass.get(CLASSES.a)).toEqual({ id: 'recap-a' });
    expect(facts.get('s1')!.assignmentsByClass.get(CLASSES.a)).toEqual([{ id: 'asg-a' }]);
    expect(facts.get('s1')!.testByClass.get(CLASSES.a)).toEqual({
      id: 'place-a',
      test_id: 'test-1',
      passing_pct: 60,
      // A class can now carry either the auto-generated catch-up paper or a
      // teacher-set class test, so the fact says which. The catch-up paper has
      // never had an Optional switch, and its pass lives on the absence row
      // rather than here.
      source: 'catchup',
      required: true,
      passed: false,
    });
  });

  it('excludes an unpublished recap, matching the per-student loader', async () => {
    const db = fakeSupabase(baseRows);

    const facts = await loadClassFactsForStudents(db, new Map([['s1', [CLASSES.b]]]));

    expect(facts.get('s1')!.recapByClass.has(CLASSES.b)).toBe(false);
  });

  it('costs the same six queries for forty students as it does for one', async () => {
    const oneStudent = fakeSupabase(baseRows);
    await loadClassFactsForStudents(oneStudent, new Map([['s1', [CLASSES.a, CLASSES.b]]]));

    const manyStudents = fakeSupabase(baseRows);
    await loadClassFactsForStudents(
      manyStudents,
      new Map(Array.from({ length: 40 }, (_, i) => [`s${i}`, [CLASSES.a, CLASSES.b]])),
    );

    expect(oneStudent.queries).toBe(6);
    expect(manyStudents.queries).toBe(6);
  });

  it('returns an entry for every student asked about, so callers need no null check', async () => {
    const db = fakeSupabase(baseRows);

    const facts = await loadClassFactsForStudents(
      db,
      new Map([
        ['s1', [CLASSES.a]],
        ['nobody', [CLASSES.a]],
      ]),
    );

    expect(facts.has('nobody')).toBe(true);
    expect([...facts.get('nobody')!.completedRecaps]).toEqual([]);
    expect([...facts.get('nobody')!.submitted]).toEqual([]);
  });

  it('asks nothing at all when there are no students', async () => {
    const db = fakeSupabase(baseRows);

    const facts = await loadClassFactsForStudents(db, new Map());

    expect(facts.size).toBe(0);
    expect(db.queries).toBe(0);
  });

  it('asks nothing when the students have no classes between them', async () => {
    const db = fakeSupabase(baseRows);

    const facts = await loadClassFactsForStudents(db, new Map([['s1', []]]));

    expect(db.queries).toBe(0);
    expect(facts.get('s1')!.recapByClass.size).toBe(0);
  });

  it('chunks a very long id list rather than building an unbounded URL', async () => {
    const manyClasses = Array.from({ length: 450 }, (_, i) => `class-${i}`);
    const db = fakeSupabase({});

    await loadClassFactsForStudents(db, new Map([['s1', manyClasses]]));

    // 450 ids over a 200 chunk is 3 requests, for each of the 3 class-level tables.
    // The student-level wave is skipped because nothing matched.
    expect(db.queries).toBe(9);
  });
});

/**
 * A teacher-set class test, across a whole cohort.
 *
 * Two things separate it from the auto-generated catch-up paper, and both are
 * easy to lose in a loader whose whole point is that class-level facts are shared
 * by reference:
 *
 *   1. It WINS. Asking an absent student to pass a second, machine-built paper on
 *      top of the one their teacher set is asking them to do more than the
 *      students who were in the room.
 *   2. Whether it is passed is a PER STUDENT fact, derived from the attempts,
 *      because it is sat through the ordinary take engine and nothing writes
 *      test_passed_at for it. Sharing that by reference would hand one student's
 *      result to the whole class.
 */
describe('loadClassFactsForStudents: teacher-set class tests', () => {
  const withClassTest: Partial<Rows> = {
    ...baseRows,
    nexus_test_placements: [
      {
        id: 'place-a',
        test_id: 'test-1',
        context_id: CLASSES.a,
        passing_pct: 60,
        context_type: 'catchup_class',
        is_active: true,
      },
      {
        id: 'place-a-class',
        test_id: 'test-class',
        context_id: CLASSES.a,
        passing_pct: 50,
        context_type: 'class_test',
        gating: { required: false, due_at: '2026-08-23T18:29:00.000Z' },
        is_active: true,
      },
    ],
    nexus_test_attempts: [
      { test_id: 'test-class', student_id: 's1', mode: 'official', status: 'submitted', percentage: 80 },
      { test_id: 'test-class', student_id: 's2', mode: 'official', status: 'submitted', percentage: 20 },
    ],
  } as Partial<Rows>;

  it('prefers the class test over the auto-generated catch-up paper', async () => {
    const db = fakeSupabase(withClassTest);
    const facts = await loadClassFactsForStudents(db, new Map([['s1', [CLASSES.a]]]));

    const test = facts.get('s1')!.testByClass.get(CLASSES.a)!;
    expect(test.source).toBe('class_test');
    expect(test.test_id).toBe('test-class');
    expect(test.required).toBe(false);
  });

  it('keeps each student pass to themselves', async () => {
    const db = fakeSupabase(withClassTest);
    const facts = await loadClassFactsForStudents(
      db,
      new Map([
        ['s1', [CLASSES.a]],
        ['s2', [CLASSES.a]],
      ]),
    );

    // s1 cleared the 50% bar, s2 did not. Sharing the map by reference here would
    // report both of them the same way.
    expect(facts.get('s1')!.testByClass.get(CLASSES.a)!.passed).toBe(true);
    expect(facts.get('s2')!.testByClass.get(CLASSES.a)!.passed).toBe(false);
  });

  it('costs nothing extra for a classroom that uses no class tests', async () => {
    const without = fakeSupabase(baseRows);
    await loadClassFactsForStudents(without, new Map([['s1', [CLASSES.a]]]));
    const withOne = fakeSupabase(withClassTest);
    await loadClassFactsForStudents(withOne, new Map([['s1', [CLASSES.a]]]));

    // Exactly one more query, and only when there is something to ask about.
    expect(withOne.queries).toBe(without.queries + 1);
  });
});
