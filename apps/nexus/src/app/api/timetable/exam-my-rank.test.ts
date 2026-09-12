// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * THE FOURTH SURFACE.
 *
 * A rank is 1-based WITHIN a sitting, and it never travels without the
 * denominator it was won against. Four places compute that denominator: the
 * private message, the teacher's sheet, the student's test card, and this
 * route, which feeds the "2nd of 9" chip on the class exam page.
 *
 * This one had both halves of the bug at once. It counted rows with no paper,
 * so a student whose window was still open swelled everybody's denominator, and
 * it counted BOTH sittings, so a second-sitting student who came second among
 * nine was told "2nd of 25".
 */

const H = vi.hoisted(() => ({
  rows: [] as any[],
  exam: {} as Record<string, unknown>,
}));

vi.mock('@neram/database', () => ({
  isRankedResultRow: (row: { absent: boolean; attempt_id?: string | null }) =>
    !row.absent && Boolean(row.attempt_id),
  getExamByClass: async () => H.exam,
  getExamMakeup: async () => null,
  resolveExamWindowForStudent: (exam: any) => ({
    opens_at: exam.opens_at,
    closes_at: exam.closes_at,
    is_makeup: false,
    is_reopen: false,
  }),
  getExamResultRows: async () => H.rows.map((r) => ({ ...r })),
  effectiveAttemptScore: (a: any) => ({ score: a?.score ?? 0, total_marks: a?.total_marks ?? 0 }),
  loadRunSittings: async () => new Map(),
  getSupabaseAdminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(ok, bad),
      };
      return chain;
    },
  }),
}));

vi.mock('@/lib/exam-access', () => ({
  resolveExamCaller: async () => ({ ok: true, caller: { id: 'kaveya', user_type: 'student' } }),
  isStaff: () => false,
}));

import { GET } from './[classId]/exam/route';

const request = { headers: { get: () => 'Bearer token' } } as never;

const resultRow = (
  student_id: string,
  over: Partial<{ sitting: 'main' | 'second'; rank: number | null; attempt_id: string | null; absent: boolean }> = {},
) => ({
  exam_id: 'ex-1',
  student_id,
  attempt_id: `att-${student_id}`,
  rank: 1,
  sitting: 'main' as 'main' | 'second',
  score: 40,
  total_marks: 50,
  percentage: 80,
  section_scores: [],
  is_provisional: false,
  absent: false,
  notified_at: null,
  published_at: '2026-08-20T10:00:00Z',
  ...over,
});

beforeEach(() => {
  H.rows = [];
  H.exam = {
    id: 'ex-1',
    scheduled_class_id: 'sc1',
    title: 'History of Architecture Test',
    opens_at: '2026-08-20T04:30:00Z',
    closes_at: '2026-08-20T07:30:00Z',
    duration_minutes: 180,
    passing_pct: 40,
    results_state: 'final',
    test_id: 't1',
  };
});

const myResult = async () => {
  const res = await GET(request, { params: { classId: 'sc1' } });
  const body = await (res as Response).json();
  return body.data.my_result;
};

describe('the rank a student is shown on the class exam page', () => {
  it('counts their own sitting, not both', async () => {
    H.rows = [
      resultRow('kaveya', { sitting: 'second', rank: 2 }),
      resultRow('late-1', { sitting: 'second', rank: 1 }),
      resultRow('day-1', { sitting: 'main', rank: 1 }),
      resultRow('day-2', { sitting: 'main', rank: 2 }),
      resultRow('day-3', { sitting: 'main', rank: 3 }),
    ];

    // 2nd of 2, the number she was told privately. Counting both sittings made
    // this "2nd of 5" about a rank won among two.
    expect(await myResult()).toMatchObject({ rank: 2, sitting: 'second', total_sat: 2 });
  });

  it('does not count a student whose window is still open', async () => {
    H.rows = [
      resultRow('kaveya', { rank: 1 }),
      resultRow('day-2', { rank: 2 }),
      // The shape the old publish route wrote for an open window: no paper, not
      // absent. Never written now, and never counted if one survives.
      resultRow('open-1', { attempt_id: null, rank: null }),
      resultRow('open-2', { attempt_id: null, rank: null }),
    ];

    expect(await myResult()).toMatchObject({ rank: 1, total_sat: 2 });
  });

  it('does not count an absentee', async () => {
    H.rows = [
      resultRow('kaveya', { rank: 1 }),
      resultRow('missed-1', { absent: true, rank: null, attempt_id: null }),
    ];

    expect(await myResult()).toMatchObject({ rank: 1, total_sat: 1 });
  });

  it('says nothing at all while the results are unpublished', async () => {
    H.exam.results_state = 'unpublished';
    H.rows = [resultRow('kaveya', { rank: 1 })];
    expect(await myResult()).toBeNull();
  });
});
