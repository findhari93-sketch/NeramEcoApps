import { describe, expect, it } from 'vitest';
import { getTestResults } from './test-analytics';

/**
 * The results tab is the only place a teacher finds out who sat a paper, so a
 * row that cannot say whose score it is has lost the one thing it was for.
 *
 * These tests exist because production showed "Unknown student" beside a correct
 * 76%: the name lookup asked `users` for a column it does not have, PostgREST
 * rejected the whole request, and the rejection was dropped on the floor because
 * the call destructured `data` and nothing else. The scores were right, so
 * nothing looked broken; the class had simply become anonymous.
 */

/** What each table really has, so a select naming anything else fails as PostgREST does. */
const COLUMNS: Record<string, string[]> = {
  nexus_test_attempts: [
    'id',
    'test_id',
    'student_id',
    'status',
    'mode',
    'score',
    'total_marks',
    'percentage',
    'submitted_at',
    'attempt_number',
    'placement_id',
    // The two-stage marking columns. A drawing section is marked by a human
    // after submission, so the objective score and the final score are stored
    // side by side rather than one overwriting the other.
    'final_score',
    'final_total_marks',
    'final_percentage',
    'finalised_at',
  ],
  nexus_tests: ['id', 'title', 'passing_marks', 'total_marks'],
  users: ['id', 'name', 'avatar_url', 'is_alumni'],
  drawing_submissions: ['id', 'exam_attempt_id', 'tutor_marks'],
};

/**
 * Minimal stand-in for the PostgREST builder. The one behaviour worth modelling
 * is the unforgiving one: ask for a column that does not exist and you get no
 * data at all, not the other columns you asked for.
 */
function stubClient(seed: Record<string, any[]>, opts: { brokenTable?: string } = {}) {
  const client = {
    from(table: string) {
      let cols: string[] = [];
      const result = (single: boolean) => {
        if (opts.brokenTable === table) {
          return Promise.resolve({ data: null, error: { code: '08006', message: 'connection failed' } });
        }
        const unknown = cols.find((c) => !(COLUMNS[table] || []).includes(c));
        if (unknown) {
          return Promise.resolve({
            data: null,
            error: { code: '42703', message: `column ${table}.${unknown} does not exist` },
          });
        }
        const rows = seed[table] || [];
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null });
      };
      const chain: Record<string, unknown> = {
        select(c: string) {
          cols = c.split(',').map((s) => s.trim());
          return chain;
        },
        eq: () => chain,
        in: () => chain,
        is: () => chain,
        order: () => chain,
        maybeSingle: () => result(true),
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          result(false).then(onFulfilled, onRejected),
      };
      return chain;
    },
  };
  return client as never;
}

const seedOneAttempt = () => ({
  nexus_test_attempts: [
    {
      id: 'att-1',
      student_id: 'stu-1',
      status: 'submitted',
      score: 38,
      total_marks: 50,
      percentage: 76,
      submitted_at: '2026-08-07T04:00:00Z',
      attempt_number: 1,
    },
  ],
  nexus_tests: [{ passing_marks: 35, total_marks: 50 }],
  users: [{ id: 'stu-1', name: 'Hari Heera', avatar_url: 'https://example.test/hari.jpg' }],
  drawing_submissions: [],
});

/** The paper wide stats, which must not move now that a roster shape exists. */
const NO_ROSTER_STATS = {
  roster_total: null,
  mandatory: null,
  submitted: null,
  not_started: null,
  missed: null,
  excused: null,
};

describe('getTestResults', () => {
  // The regression. Production test acf8084d showed one attempt at 76% with the
  // student rendered as "Unknown student" while the users row said Hari Heera.
  it('names the student who sat the test', async () => {
    const { rows } = await getTestResults('test-1', undefined, stubClient(seedOneAttempt()));

    expect(rows).toHaveLength(1);
    expect(rows[0].student_name).toBe('Hari Heera');
    expect(rows[0].best_percentage).toBe(76);
  });

  // Staff surfaces ring a student's face with their cohort, which they cannot do
  // from a name alone.
  it('carries the avatar alongside the name', async () => {
    const { rows } = await getTestResults('test-1', undefined, stubClient(seedOneAttempt()));
    expect(rows[0].avatar_url).toBe('https://example.test/hari.jpg');
  });

  /**
   * Loud rather than degraded, matching the student-tests route. A failed name
   * lookup should read as broken, because a roomful of anonymous students beside
   * accurate scores is the one outcome nobody questions.
   */
  it('throws when the name lookup fails instead of reporting unknown students', async () => {
    const client = stubClient(seedOneAttempt(), { brokenTable: 'users' });
    await expect(getTestResults('test-1', undefined, client)).rejects.toBeTruthy();
  });

  it('still reports the pass mark and the stats', async () => {
    const { rows, stats } = await getTestResults('test-1', undefined, stubClient(seedOneAttempt()));

    // 76% against a 35/50 bar of 70%.
    expect(rows[0].passed).toBe(true);
    expect(stats).toMatchObject({ students: 1, attempts: 1, average: 76, passed: 1, ...NO_ROSTER_STATS });
  });

  it('has nothing to look up when nobody has sat the test', async () => {
    const client = stubClient({
      nexus_test_attempts: [],
      nexus_tests: [{ passing_marks: 35, total_marks: 50 }],
      drawing_submissions: [],
    });
    const { rows, stats } = await getTestResults('test-1', undefined, client);

    expect(rows).toEqual([]);
    expect(stats).toMatchObject({ students: 0, attempts: 0, average: null, passed: 0, ...NO_ROSTER_STATS });
  });

  /**
   * The founder's complaint in one test. A bare "100%" told a teacher nothing
   * about what the student knew when the paper was set, and nothing about how
   * many questions that was out of.
   */
  it('separates the first sitting from the best one, each with its raw marks', async () => {
    const client = stubClient({
      nexus_test_attempts: [
        { id: 'a1', student_id: 'stu-1', status: 'submitted', score: 28, total_marks: 45, percentage: 62, submitted_at: '2026-08-07T04:00:00Z', attempt_number: 1 },
        { id: 'a2', student_id: 'stu-1', status: 'submitted', score: 45, total_marks: 45, percentage: 100, submitted_at: '2026-08-09T04:00:00Z', attempt_number: 2 },
      ],
      nexus_tests: [{ passing_marks: 27, total_marks: 45 }],
      users: [{ id: 'stu-1', name: 'Inaya', avatar_url: null }],
      drawing_submissions: [],
    });

    const { rows } = await getTestResults('test-1', undefined, client);

    expect(rows[0].attempts).toBe(2);
    expect(rows[0].first_percentage).toBe(62);
    expect(rows[0].first_score).toBe(28);
    expect(rows[0].first_total_marks).toBe(45);
    expect(rows[0].best_percentage).toBe(100);
    expect(rows[0].best_score).toBe(45);
  });

  /**
   * The half of the report that never existed. A student who ignored the paper
   * simply had no row, so a teacher could not tell a finished class from a
   * class that never opened it.
   */
  it('lists the students who never sat it when a roster is supplied', async () => {
    const client = stubClient(seedOneAttempt());
    const { rows, stats } = await getTestResults(
      'test-1',
      {
        closesAt: '2026-08-08T04:00:00Z',
        roster: [
          { student_id: 'stu-1', name: 'Hari Heera', avatar_url: null, bucket: 'mandatory_attended', is_mandatory: true },
          { student_id: 'stu-2', name: 'Meera S', avatar_url: null, bucket: 'mandatory_attended', is_mandatory: true },
          { student_id: 'stu-3', name: 'Arun P', avatar_url: null, bucket: 'excused_new_joiner', is_mandatory: false },
        ],
      },
      client,
    );

    expect(rows).toHaveLength(3);
    const byId = Object.fromEntries(rows.map((r) => [r.student_id, r]));
    expect(byId['stu-1'].status).toBe('submitted');
    // Closed on the 8th and she never sat it.
    expect(byId['stu-2'].status).toBe('missed');
    expect(byId['stu-2'].attempts).toBe(0);
    // Joined after the class, so nothing is outstanding.
    expect(byId['stu-3'].status).toBe('excused');

    // The attempter counts stay about who sat it; the roster counts are separate.
    expect(stats.students).toBe(1);
    expect(stats.roster_total).toBe(3);
    expect(stats.missed).toBe(1);
    expect(stats.excused).toBe(1);
  });

  /**
   * Founder rule, 2026-09-13: a paused (dormant) student is in no list and no
   * count. One who really sat it keeps a row for their marks, tagged, but never
   * moves the average, the pass count or the "not done" tallies.
   */
  it('drops paused students with no sitting and keeps a paused sitting out of every stat', async () => {
    const client = stubClient(seedOneAttempt());
    const { rows, stats } = await getTestResults(
      'test-1',
      {
        closesAt: '2026-08-08T04:00:00Z',
        pausedStudentIds: ['stu-1', 'stu-2'],
        roster: [
          { student_id: 'stu-1', name: 'Hari Heera', avatar_url: null, bucket: 'mandatory_attended', is_mandatory: true },
          { student_id: 'stu-2', name: 'Meera S', avatar_url: null, bucket: 'mandatory_attended', is_mandatory: true },
          { student_id: 'stu-3', name: 'Arun P', avatar_url: null, bucket: 'mandatory_attended', is_mandatory: true },
        ],
      },
      client,
    );

    expect(rows.map((r) => r.student_id).sort()).toEqual(['stu-1', 'stu-3']);
    expect(rows.find((r) => r.student_id === 'stu-1')!.paused).toBe(true);
    expect(rows.find((r) => r.student_id === 'stu-3')!.paused).toBe(false);
    expect(stats).toMatchObject({ students: 0, attempts: 0, average: null, passed: 0, roster_total: 1, missed: 1 });
  });

  it('does not mark a student missed while they hold a window of their own', async () => {
    const client = stubClient(seedOneAttempt());
    const { rows } = await getTestResults(
      'test-1',
      {
        closesAt: '2026-08-08T04:00:00Z',
        windowsByStudent: { 'stu-2': '2099-01-01T00:00:00Z' },
        roster: [
          { student_id: 'stu-1', name: 'Hari Heera', avatar_url: null, bucket: 'mandatory_attended', is_mandatory: true },
          { student_id: 'stu-2', name: 'Meera S', avatar_url: null, bucket: 'mandatory_caught_up', is_mandatory: true },
        ],
      },
      client,
    );

    const meera = rows.find((r) => r.student_id === 'stu-2')!;
    expect(meera.status).toBe('not_started');
    expect(meera.window_open_until).toBe('2099-01-01T00:00:00Z');
  });

  /**
   * The bug this change fixes. A drawing section is marked by a human after
   * submission, so `percentage` holds only the objective half. Reading it
   * directly reported a half marked exam as though it were the real score.
   */
  it('reads a finalised exam score rather than the objective half', async () => {
    const client = stubClient({
      nexus_test_attempts: [
        {
          id: 'a1',
          student_id: 'stu-1',
          status: 'submitted',
          score: 90,
          total_marks: 200,
          percentage: 45,
          final_score: 170,
          final_total_marks: 200,
          final_percentage: 85,
          finalised_at: '2026-08-10T04:00:00Z',
          submitted_at: '2026-08-07T04:00:00Z',
          attempt_number: 1,
        },
      ],
      nexus_tests: [{ passing_marks: 100, total_marks: 200 }],
      users: [{ id: 'stu-1', name: 'Inaya', avatar_url: null }],
      drawing_submissions: [],
    });

    const { rows } = await getTestResults('test-1', undefined, client);

    expect(rows[0].best_percentage).toBe(85);
    expect(rows[0].best_score).toBe(170);
    expect(rows[0].passed).toBe(true);
    expect(rows[0].provisional).toBe(false);
  });

  /**
   * And the flip side: an ordinary MCQ paper has no finalised_at either, so
   * "not finalised" cannot be what marks a row provisional. Only an actual
   * unmarked drawing can, or every class test in the product wears the chip.
   */
  it('does not call an ordinary test provisional just because nothing was hand marked', async () => {
    const { rows } = await getTestResults('test-1', undefined, stubClient(seedOneAttempt()));
    expect(rows[0].provisional).toBe(false);
  });

  it('flags a row provisional while its best attempt still has an unmarked drawing', async () => {
    const seed = seedOneAttempt();
    seed.drawing_submissions = [{ id: 'd1', exam_attempt_id: 'att-1', tutor_marks: null }] as never;
    const { rows } = await getTestResults('test-1', undefined, stubClient(seed));
    expect(rows[0].provisional).toBe(true);
  });

  /**
   * A student part way through must not read as absent. They are working on it
   * right now, which is the opposite of the thing a teacher would chase.
   */
  it('shows a sitting still open as in progress, and keeps it out of the scores', async () => {
    const client = stubClient({
      nexus_test_attempts: [
        { id: 'a1', student_id: 'stu-2', status: 'in_progress', score: null, total_marks: null, percentage: null, submitted_at: null, attempt_number: 1 },
      ],
      nexus_tests: [{ passing_marks: 35, total_marks: 50 }],
      users: [{ id: 'stu-2', name: 'Divya R', avatar_url: null }],
      drawing_submissions: [],
    });

    const { rows, stats } = await getTestResults('test-1', undefined, client);

    expect(rows[0].status).toBe('in_progress');
    expect(rows[0].attempts).toBe(0);
    expect(stats.attempts).toBe(0);
    expect(stats.average).toBe(null);
  });
});
