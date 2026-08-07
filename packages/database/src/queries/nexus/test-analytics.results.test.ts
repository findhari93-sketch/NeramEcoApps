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
    'percentage',
    'submitted_at',
    'attempt_number',
  ],
  nexus_tests: ['id', 'title', 'passing_marks', 'total_marks'],
  users: ['id', 'name', 'avatar_url', 'is_alumni'],
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
      student_id: 'stu-1',
      percentage: 76,
      submitted_at: '2026-08-07T04:00:00Z',
      attempt_number: 1,
    },
  ],
  nexus_tests: [{ passing_marks: 35, total_marks: 50 }],
  users: [{ id: 'stu-1', name: 'Hari Heera', avatar_url: 'https://example.test/hari.jpg' }],
});

describe('getTestResults', () => {
  // The regression. Production test acf8084d showed one attempt at 76% with the
  // student rendered as "Unknown student" while the users row said Hari Heera.
  it('names the student who sat the test', async () => {
    const { rows } = await getTestResults('test-1', stubClient(seedOneAttempt()));

    expect(rows).toHaveLength(1);
    expect(rows[0].student_name).toBe('Hari Heera');
    expect(rows[0].best_percentage).toBe(76);
  });

  // Staff surfaces ring a student's face with their cohort, which they cannot do
  // from a name alone.
  it('carries the avatar alongside the name', async () => {
    const { rows } = await getTestResults('test-1', stubClient(seedOneAttempt()));
    expect(rows[0].avatar_url).toBe('https://example.test/hari.jpg');
  });

  /**
   * Loud rather than degraded, matching the student-tests route. A failed name
   * lookup should read as broken, because a roomful of anonymous students beside
   * accurate scores is the one outcome nobody questions.
   */
  it('throws when the name lookup fails instead of reporting unknown students', async () => {
    const client = stubClient(seedOneAttempt(), { brokenTable: 'users' });
    await expect(getTestResults('test-1', client)).rejects.toBeTruthy();
  });

  it('still reports the pass mark and the stats', async () => {
    const { rows, stats } = await getTestResults('test-1', stubClient(seedOneAttempt()));

    // 76% against a 35/50 bar of 70%.
    expect(rows[0].passed).toBe(true);
    expect(stats).toEqual({ students: 1, attempts: 1, average: 76, passed: 1 });
  });

  it('has nothing to look up when nobody has sat the test', async () => {
    const client = stubClient({ nexus_test_attempts: [], nexus_tests: [{ passing_marks: 35, total_marks: 50 }] });
    const { rows, stats } = await getTestResults('test-1', client);

    expect(rows).toEqual([]);
    expect(stats).toEqual({ students: 0, attempts: 0, average: null, passed: 0 });
  });
});
