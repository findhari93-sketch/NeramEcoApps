import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The composed paper the re-grade sees. Mocked at the module boundary because
 * getComposedTestQuestions is the function that reads the LIVE answer key, and
 * the whole point of a re-grade is that the key changed since the attempt was
 * submitted. gradeAgainstDraw is kept real: it is the thing under test by proxy.
 */
const composed = vi.hoisted(() => ({ current: [] as any[] }));

vi.mock('./test-repository', async () => {
  const actual = await vi.importActual<typeof import('./test-repository')>('./test-repository');
  return {
    ...actual,
    getComposedTestQuestions: vi.fn(async () => composed.current),
  };
});

vi.mock('../../client', () => ({
  getSupabaseAdminClient: () => {
    throw new Error('the test must pass its own client');
  },
}));

import { regradeTestAttempts } from './test-regrade';

const question = (id: string, correct: string, marks = 4): any => ({
  test_question_id: `tq-${id}`,
  question_id: id,
  question_text: id,
  question_image_url: null,
  question_format: 'MCQ',
  options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  marks,
  negative_marks: 0,
  section: 'math_mcq',
  section_order: 1,
  sort_order: 0,
  correct_answer: correct,
});

interface StubData {
  attempts: any[];
  draws?: any[];
  placements?: any[];
}

/** Records every write so a test can prove a dry run wrote nothing. */
interface Writes {
  updates: Array<{ table: string; patch: any; id: string }>;
  inserts: Array<{ table: string; rows: any[] }>;
}

function stubClient(data: StubData, writes: Writes) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: any = {
        select: () => builder,
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        in(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        update(patch: any) {
          builder._patch = patch;
          return builder;
        },
        insert(rows: any) {
          writes.inserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
          return Promise.resolve({ error: null });
        },
        then(resolve: (v: unknown) => void) {
          if (builder._patch) {
            writes.updates.push({ table, patch: builder._patch, id: String(filters.id) });
            return Promise.resolve(resolve({ error: null }));
          }
          if (table === 'nexus_test_attempts') {
            const rows = data.attempts.filter((a) =>
              filters.placement_id ? a.placement_id === filters.placement_id : true,
            );
            return Promise.resolve(resolve({ data: rows, error: null }));
          }
          if (table === 'nexus_test_draws') {
            return Promise.resolve(resolve({ data: data.draws || [], error: null }));
          }
          if (table === 'nexus_test_placements') {
            return Promise.resolve(resolve({ data: data.placements || [], error: null }));
          }
          throw new Error(`unexpected table ${table}`);
        },
      };
      return builder;
    },
  } as any;
}

let writes: Writes;

beforeEach(() => {
  writes = { updates: [], inserts: [] };
  composed.current = [];
});

describe('regradeTestAttempts: the Indus Valley case', () => {
  // The question that prompted the feature: the key said 'a' (Copper Age),
  // nine of nine students answered 'b' (Bronze Age), and the key has now been
  // corrected to 'b'.
  beforeEach(() => {
    composed.current = [question('q1', 'b')];
  });

  it('moves an attempt that was marked wrong by the old key', async () => {
    const client = stubClient(
      {
        attempts: [
          {
            id: 'att-1',
            student_id: 'u1',
            placement_id: 'p1',
            attempt_number: 1,
            status: 'submitted',
            answers: { q1: 'b' },
            submitted_at: '2026-08-18T10:00:00Z',
            score: 0,
            total_marks: 4,
            percentage: 0,
            users: { name: 'Asha' },
          },
        ],
        placements: [{ id: 'p1', passing_pct: 80 }],
      },
      writes,
    );

    const out = await regradeTestAttempts({ testId: 't1', dryRun: true }, client);

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].old_percentage).toBe(0);
    expect(out.rows[0].new_percentage).toBe(100);
    expect(out.rows[0].changed).toBe(true);
    expect(out.summary.changed).toBe(1);
    expect(out.summary.moved_up).toBe(1);
    expect(out.summary.now_passing).toBe(1);
  });

  it('writes nothing at all on a dry run', async () => {
    const client = stubClient(
      {
        attempts: [
          {
            id: 'att-1',
            student_id: 'u1',
            placement_id: 'p1',
            attempt_number: 1,
            status: 'submitted',
            answers: { q1: 'b' },
            submitted_at: '2026-08-18T10:00:00Z',
            score: 0,
            total_marks: 4,
            percentage: 0,
          },
        ],
        placements: [{ id: 'p1', passing_pct: 80 }],
      },
      writes,
    );

    const out = await regradeTestAttempts({ testId: 't1', dryRun: true }, client);

    expect(out.dry_run).toBe(true);
    expect(writes.updates).toEqual([]);
    expect(writes.inserts).toEqual([]);
  });

  it('writes the new score and one log row when applied', async () => {
    const client = stubClient(
      {
        attempts: [
          {
            id: 'att-1',
            student_id: 'u1',
            placement_id: 'p1',
            attempt_number: 1,
            status: 'submitted',
            answers: { q1: 'b' },
            submitted_at: '2026-08-18T10:00:00Z',
            score: 0,
            total_marks: 4,
            percentage: 0,
          },
        ],
        placements: [{ id: 'p1', passing_pct: 80 }],
      },
      writes,
    );

    await regradeTestAttempts({ testId: 't1', dryRun: false, actorId: 'teacher-1' }, client);

    expect(writes.updates).toHaveLength(1);
    expect(writes.updates[0].table).toBe('nexus_test_attempts');
    expect(writes.updates[0].patch).toEqual({ score: 4, total_marks: 4, percentage: 100 });
    // The score columns only. final_* belongs to drawing marking.
    expect(Object.keys(writes.updates[0].patch)).not.toContain('final_percentage');

    expect(writes.inserts).toHaveLength(1);
    expect(writes.inserts[0].table).toBe('nexus_test_regrades');
    expect(writes.inserts[0].rows[0]).toMatchObject({
      attempt_id: 'att-1',
      old_percentage: 0,
      new_percentage: 100,
      actor_id: 'teacher-1',
    });
  });

  it('leaves an attempt whose score did not move completely alone', async () => {
    const client = stubClient(
      {
        attempts: [
          {
            id: 'att-2',
            student_id: 'u2',
            placement_id: 'p1',
            attempt_number: 1,
            status: 'submitted',
            answers: { q1: 'b' },
            submitted_at: '2026-08-18T10:00:00Z',
            // Already correct under the new key.
            score: 4,
            total_marks: 4,
            percentage: 100,
          },
        ],
        placements: [{ id: 'p1', passing_pct: 80 }],
      },
      writes,
    );

    const out = await regradeTestAttempts({ testId: 't1', dryRun: false }, client);

    expect(out.rows[0].changed).toBe(false);
    expect(out.summary.changed).toBe(0);
    expect(writes.updates).toEqual([]);
    expect(writes.inserts).toEqual([]);
  });

  it('counts a student who drops below the pass mark', async () => {
    // The key moved the other way: this student had been marked right by the
    // old key and is now wrong.
    const client = stubClient(
      {
        attempts: [
          {
            id: 'att-3',
            student_id: 'u3',
            placement_id: 'p1',
            attempt_number: 1,
            status: 'submitted',
            answers: { q1: 'a' },
            submitted_at: '2026-08-18T10:00:00Z',
            score: 4,
            total_marks: 4,
            percentage: 100,
          },
        ],
        placements: [{ id: 'p1', passing_pct: 80 }],
      },
      writes,
    );

    const out = await regradeTestAttempts({ testId: 't1', dryRun: true }, client);

    expect(out.rows[0].new_percentage).toBe(0);
    expect(out.summary.moved_down).toBe(1);
    expect(out.summary.now_failing).toBe(1);
  });
});

describe('regradeTestAttempts: the draw', () => {
  /**
   * The trap this pins. The paper was drawn, so the student saw the options
   * permuted, and the answer stored on the attempt is in the lettering THEY
   * clicked. Grading it without the draw compares displayed lettering against
   * bank lettering and silently marks a correct paper wrong, producing a number
   * that looks completely ordinary.
   */
  it('honours the permutation the student actually sat', async () => {
    composed.current = [question('q1', 'a')];

    const attempts = [
      {
        id: 'att-1',
        student_id: 'u1',
        placement_id: 'p1',
        attempt_number: 1,
        status: 'submitted',
        // Under this draw, displayed 'b' IS the correct option.
        answers: { q1: 'b' },
        submitted_at: '2026-08-18T10:00:00Z',
        score: 0,
        total_marks: 4,
        percentage: 0,
      },
    ];
    const draws = [
      {
        student_id: 'u1',
        attempt_number: 1,
        question_ids: ['q1'],
        option_maps: { q1: ['b', 'a', 'c', 'd'] },
      },
    ];

    const withDraw = await regradeTestAttempts(
      { testId: 't1', dryRun: true },
      stubClient({ attempts, draws, placements: [{ id: 'p1', passing_pct: 80 }] }, writes),
    );
    expect(withDraw.rows[0].new_percentage).toBe(100);

    // Same answers, same key, no draw row: now the click reads as a plain 'b'
    // against a key of 'a' and grades to zero. Two very different results from
    // one set of stored answers, which is why the draw must be loaded.
    const withoutDraw = await regradeTestAttempts(
      { testId: 't1', dryRun: true },
      stubClient({ attempts, draws: [], placements: [{ id: 'p1', passing_pct: 80 }] }, writes),
    );
    expect(withoutDraw.rows[0].new_percentage).toBe(0);
  });

  it('matches a draw by student AND attempt number, never by student alone', async () => {
    composed.current = [question('q1', 'a')];

    const out = await regradeTestAttempts(
      { testId: 't1', dryRun: true },
      stubClient(
        {
          attempts: [
            {
              id: 'att-2',
              student_id: 'u1',
              placement_id: 'p1',
              attempt_number: 2,
              status: 'submitted',
              answers: { q1: 'a' },
              submitted_at: '2026-08-18T11:00:00Z',
              score: 4,
              total_marks: 4,
              percentage: 100,
            },
          ],
          // A draw exists, but for the FIRST sitting. Applying it to the second
          // would regrade the wrong paper.
          draws: [
            {
              student_id: 'u1',
              attempt_number: 1,
              question_ids: ['q1'],
              option_maps: { q1: ['b', 'a', 'c', 'd'] },
            },
          ],
          placements: [{ id: 'p1', passing_pct: 80 }],
        },
        writes,
      ),
    );

    expect(out.rows[0].new_percentage).toBe(100);
    expect(out.rows[0].changed).toBe(false);
  });
});

describe('regradeTestAttempts: scope and edges', () => {
  it('judges each attempt by the pass mark of its own run', async () => {
    composed.current = [question('q1', 'a')];

    const out = await regradeTestAttempts(
      { testId: 't1', dryRun: true },
      stubClient(
        {
          attempts: [
            {
              id: 'a1',
              student_id: 'u1',
              placement_id: 'strict',
              attempt_number: 1,
              status: 'submitted',
              answers: { q1: 'a' },
              submitted_at: '2026-08-18T10:00:00Z',
              score: 0,
              total_marks: 4,
              percentage: 0,
            },
          ],
          placements: [
            { id: 'strict', passing_pct: 80 },
            { id: 'loose', passing_pct: 10 },
          ],
        },
        writes,
      ),
    );

    expect(out.rows[0].new_passed).toBe(true);
    expect(out.rows[0].old_passed).toBe(false);
  });

  it('reports no pass verdict at all for a run with no pass mark', async () => {
    composed.current = [question('q1', 'a')];

    const out = await regradeTestAttempts(
      { testId: 't1', dryRun: true },
      stubClient(
        {
          attempts: [
            {
              id: 'a1',
              student_id: 'u1',
              placement_id: null,
              attempt_number: 1,
              status: 'submitted',
              answers: { q1: 'a' },
              submitted_at: '2026-08-18T10:00:00Z',
              score: 0,
              total_marks: 4,
              percentage: 0,
            },
          ],
        },
        writes,
      ),
    );

    expect(out.rows[0].new_passed).toBeNull();
    expect(out.summary.now_passing).toBe(0);
  });

  it('does nothing for a test with no questions left', async () => {
    composed.current = [];
    const out = await regradeTestAttempts(
      { testId: 't1', dryRun: false },
      stubClient({ attempts: [] }, writes),
    );
    expect(out.summary.attempts).toBe(0);
    expect(writes.updates).toEqual([]);
  });
});
