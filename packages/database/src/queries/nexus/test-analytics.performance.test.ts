import { describe, expect, it } from 'vitest';
import { getStudentPerformanceSummary, listStudentAttempts } from './test-analytics';

/**
 * The performance dashboard's whole point is telling a student "you attempted
 * N tests, this is your trend" without silently blending practice drills,
 * class tests and exams into one meaningless average. These tests exist to
 * pin the one non-obvious rule: an attempt's kind comes from its PLACEMENT's
 * context_type, never from the test's own test_kind, because "exam" is not a
 * test_kind at all.
 */

/** What each table really has, so a select naming anything else fails as PostgREST does. */
const COLUMNS: Record<string, string[]> = {
  nexus_test_attempts: [
    'id',
    'test_id',
    'student_id',
    'status',
    'mode',
    'placement_id',
    'attempt_number',
    'score',
    'total_marks',
    'percentage',
    'time_spent_seconds',
    'submitted_at',
  ],
  nexus_tests: ['id', 'title', 'test_kind', 'passing_marks', 'total_marks'],
  nexus_test_placements: ['id', 'context_type'],
};

/**
 * Minimal stand-in for the PostgREST builder, matching the pattern in
 * test-analytics.results.test.ts: eq/in are no-ops and the seed rows ARE the
 * already-filtered result, since the one behaviour worth modelling here is the
 * unforgiving one, a select naming an unknown column returns no data at all.
 */
function stubClient(seed: Record<string, any[]>, opts: { brokenTable?: string } = {}) {
  const client = {
    from(table: string) {
      let cols: string[] = [];
      const result = () => {
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
        return Promise.resolve({ data: seed[table] || [], error: null });
      };
      const chain: Record<string, unknown> = {
        select(c: string) {
          cols = c.split(',').map((s) => s.trim());
          return chain;
        },
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => result(),
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          result().then(onFulfilled, onRejected),
      };
      return chain;
    },
  };
  return client as never;
}

describe('getStudentPerformanceSummary', () => {
  it('classifies attempts by placement context, not by test_kind', async () => {
    const seed = {
      nexus_test_attempts: [
        // A student_custom paper with no placement at all: practice.
        { placement_id: null, percentage: 80, submitted_at: '2026-08-05T04:00:00Z' },
        // Assigned to the class via a classroom_assignment placement: class.
        { placement_id: 'p-class', percentage: 60, submitted_at: '2026-08-06T04:00:00Z' },
        // Sat through an exam placement: exam, even though nothing about the
        // attempt row itself says so.
        { placement_id: 'p-exam', percentage: 90, submitted_at: '2026-08-07T04:00:00Z' },
      ],
      nexus_test_placements: [
        { id: 'p-class', context_type: 'classroom_assignment' },
        { id: 'p-exam', context_type: 'exam' },
      ],
    };

    const summary = await getStudentPerformanceSummary('stu-1', stubClient(seed));

    expect(summary.by_kind_totals).toEqual({ practice: 1, class: 1, exam: 1 });
    expect(summary.total_attempts).toBe(3);
    expect(summary.overall_average_pct).toBe(Math.round((80 + 60 + 90) / 3));
  });

  it('groups attempts into monthly buckets, newest month first', async () => {
    const seed = {
      nexus_test_attempts: [
        { placement_id: null, percentage: 70, submitted_at: '2025-12-20T04:00:00Z' },
        { placement_id: null, percentage: 90, submitted_at: '2026-01-05T04:00:00Z' },
      ],
      nexus_test_placements: [],
    };

    const summary = await getStudentPerformanceSummary('stu-1', stubClient(seed));

    // Year boundary crossed correctly: Jan 2026 sorts ahead of Dec 2025.
    expect(summary.monthly.map((m) => m.month)).toEqual(['2026-01', '2025-12']);
    expect(summary.monthly[0].attempts).toBe(1);
    expect(summary.monthly[0].average_pct).toBe(90);
  });

  it('reports an empty summary rather than throwing when nothing has been attempted', async () => {
    const summary = await getStudentPerformanceSummary(
      'stu-1',
      stubClient({ nexus_test_attempts: [], nexus_test_placements: [] }),
    );

    expect(summary).toEqual({
      total_attempts: 0,
      overall_average_pct: null,
      attempts_this_month: 0,
      average_this_month: null,
      by_kind_totals: { practice: 0, class: 0, exam: 0 },
      monthly: [],
    });
  });

  it('throws rather than silently mis-classifying when the placement lookup fails', async () => {
    const seed = {
      nexus_test_attempts: [{ placement_id: 'p-exam', percentage: 90, submitted_at: '2026-08-07T04:00:00Z' }],
      nexus_test_placements: [{ id: 'p-exam', context_type: 'exam' }],
    };
    await expect(
      getStudentPerformanceSummary('stu-1', stubClient(seed, { brokenTable: 'nexus_test_placements' })),
    ).rejects.toBeTruthy();
  });
});

describe('listStudentAttempts kind classification', () => {
  it('carries test_kind and the derived kind onto each attempt row', async () => {
    const seed = {
      nexus_test_attempts: [
        {
          id: 'att-1',
          test_id: 'test-1',
          placement_id: 'p-exam',
          attempt_number: 1,
          score: 45,
          total_marks: 50,
          percentage: 90,
          time_spent_seconds: 1200,
          submitted_at: '2026-08-07T04:00:00Z',
        },
      ],
      nexus_tests: [{ id: 'test-1', title: 'Model Test 3', test_kind: 'mock', passing_marks: 20, total_marks: 50 }],
      nexus_test_placements: [{ id: 'p-exam', context_type: 'exam' }],
    };

    const rows = await listStudentAttempts('stu-1', undefined, stubClient(seed));

    expect(rows).toHaveLength(1);
    expect(rows[0].test_kind).toBe('mock');
    expect(rows[0].kind).toBe('exam');
  });

  it('falls back to practice when an attempt has no placement', async () => {
    const seed = {
      nexus_test_attempts: [
        {
          id: 'att-1',
          test_id: 'test-1',
          placement_id: null,
          attempt_number: 1,
          score: 12,
          total_marks: 15,
          percentage: 80,
          time_spent_seconds: 600,
          submitted_at: '2026-08-07T04:00:00Z',
        },
      ],
      nexus_tests: [
        { id: 'test-1', title: 'Quick 15', test_kind: 'student_custom', passing_marks: null, total_marks: 15 },
      ],
      nexus_test_placements: [],
    };

    const rows = await listStudentAttempts('stu-1', undefined, stubClient(seed));

    expect(rows[0].kind).toBe('practice');
  });
});
