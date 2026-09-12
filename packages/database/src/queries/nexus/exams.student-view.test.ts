import { describe, it, expect } from 'vitest';
import { listStudentExams } from './exams';

/**
 * A student's own exam view must never leak another student's result before
 * results_state moves off 'unpublished', and every lookup has to be batched
 * across the classroom's exams rather than one query per exam, since this
 * runs on every Class Tests tab load. These tests pin both.
 */

const COLUMNS: Record<string, string[]> = {
  nexus_exams: ['*'],
  nexus_exam_makeups: ['*'],
  nexus_test_attempts: [
    'id',
    'test_id',
    'student_id',
    'status',
    'mode',
    'placement_id',
    'started_at',
    'submitted_at',
    'attempt_number',
  ],
  nexus_test_placements: ['id', 'test_id', 'context_id', 'available_from', 'available_until'],
  nexus_test_access_requests: ['placement_id', 'student_id', 'opens_at', 'closes_at'],
  nexus_test_run_credits: ['placement_id', 'student_id', 'attempt_id', 'note', 'credited_by', 'credited_at'],
  nexus_exam_results: ['exam_id', 'student_id', 'rank', 'score', 'total_marks', 'percentage', 'is_provisional', 'absent'],
};

function stubClient(seed: Record<string, any[]>) {
  const calls: Record<string, number> = {};
  const client = {
    from(table: string) {
      calls[table] = (calls[table] || 0) + 1;
      let cols: string[] = [];
      const result = () => {
        if (cols[0] !== '*') {
          const unknown = cols.find((c) => !(COLUMNS[table] || []).includes(c));
          if (unknown) {
            return Promise.resolve({
              data: null,
              error: { code: '42703', message: `column ${table}.${unknown} does not exist` },
            });
          }
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
        range: () => chain,
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          result().then(onFulfilled, onRejected),
      };
      return chain;
    },
    __calls: calls,
  };
  return client;
}

const baseExam = {
  id: 'ex1',
  scheduled_class_id: 'sc1',
  series_id: 'series1',
  classroom_id: 'c1',
  test_id: 't1',
  title: 'Model Test 1',
  opens_at: '2026-08-20T04:30:00Z',
  closes_at: '2026-08-20T07:30:00Z',
  duration_minutes: 180,
  passing_pct: 40,
  results_published_at: null,
  results_published_by: null,
  teams_results_message_id: null,
  teams_results_posted_at: null,
  created_by: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

describe('listStudentExams', () => {
  it('shows no result while results_state is unpublished, and never queries for one', async () => {
    const client = stubClient({
      nexus_exams: [{ ...baseExam, results_state: 'unpublished' }],
      nexus_exam_makeups: [],
      nexus_test_attempts: [],
    });

    const views = await listStudentExams('stu-1', 'c1', client as never);

    expect(views).toHaveLength(1);
    expect(views[0].results_state).toBe('unpublished');
    expect(views[0].result).toBeNull();
    expect(views[0].attempted).toBe(false);
    // The whole point of batching by published-only exam ids: an unpublished
    // exam must not trigger a query against the results table at all.
    expect((client as any).__calls['nexus_exam_results']).toBeUndefined();
  });

  it('reports attempted + attempt_id once the student has an official submitted attempt', async () => {
    const client = stubClient({
      nexus_exams: [{ ...baseExam, results_state: 'unpublished' }],
      nexus_exam_makeups: [],
      nexus_test_attempts: [{ id: 'att-1', test_id: 't1' }],
    });

    const [view] = await listStudentExams('stu-1', 'c1', client as never);
    expect(view.attempted).toBe(true);
    expect(view.attempt_id).toBe('att-1');
  });

  it('a live makeup grant REPLACES the main window, matching resolveExamWindowForStudent', async () => {
    const client = stubClient({
      nexus_exams: [{ ...baseExam, results_state: 'unpublished' }],
      nexus_exam_makeups: [
        {
          id: 'm1',
          exam_id: 'ex1',
          student_id: 'stu-1',
          opens_at: '2026-08-22T04:30:00Z',
          closes_at: '2026-08-22T07:30:00Z',
          reason: 'Medical',
          granted_by: 'staff-1',
          granted_at: '2026-08-21T00:00:00Z',
          revoked_at: null,
        },
      ],
      nexus_test_attempts: [],
    });

    const [view] = await listStudentExams('stu-1', 'c1', client as never);
    expect(view.is_makeup).toBe(true);
    expect(view.opens_at).toBe('2026-08-22T04:30:00Z');
    expect(view.closes_at).toBe('2026-08-22T07:30:00Z');
  });

  it('total_ranked counts non-absent candidates only, and never another student’s row', async () => {
    const client = stubClient({
      nexus_exams: [{ ...baseExam, results_state: 'final' }],
      nexus_exam_makeups: [],
      nexus_test_attempts: [{ id: 'att-1', test_id: 't1' }],
      nexus_exam_results: [
        { exam_id: 'ex1', student_id: 'stu-1', rank: 2, score: 80, total_marks: 100, percentage: 80, is_provisional: false, absent: false },
        { exam_id: 'ex1', student_id: 'stu-2', rank: 1, score: 90, total_marks: 100, percentage: 90, is_provisional: false, absent: false },
        { exam_id: 'ex1', student_id: 'stu-3', rank: null, score: null, total_marks: 100, percentage: null, is_provisional: false, absent: true },
      ],
    });

    const [view] = await listStudentExams('stu-1', 'c1', client as never);
    expect(view.result).toMatchObject({ rank: 2, total_ranked: 2, percentage: 80 });
    // Nothing here identifies stu-2 or stu-3, only the count.
    expect(JSON.stringify(view.result)).not.toContain('stu-2');
  });

  it('returns an empty list rather than querying anything when the classroom has no exams', async () => {
    const client = stubClient({ nexus_exams: [] });
    const views = await listStudentExams('stu-1', 'c1', client as never);
    expect(views).toEqual([]);
    expect((client as any).__calls['nexus_exam_makeups']).toBeUndefined();
  });

  /**
   * The 18 Aug shape. The exam door refused students who had practised, so they
   * sat the paper through Study Materials instead. Inside the exam window that
   * counts as the exam; a week before, it does not.
   */
  const withExamDoor = (attempts: any[]) =>
    stubClient({
      nexus_exams: [{ ...baseExam, results_state: 'unpublished' }],
      nexus_exam_makeups: [],
      nexus_test_placements: [
        {
          id: 'p-exam',
          test_id: 't1',
          context_id: 'sc1',
          available_from: baseExam.opens_at,
          available_until: baseExam.closes_at,
        },
      ],
      nexus_test_attempts: attempts,
      nexus_test_access_requests: [],
      nexus_test_run_credits: [],
    });

  const practice = (id: string, started: string, submitted: string) => ({
    id,
    test_id: 't1',
    student_id: 'stu-1',
    status: 'submitted',
    mode: 'official',
    placement_id: 'study-door',
    started_at: started,
    submitted_at: submitted,
    attempt_number: 1,
  });

  it('counts a Study Materials attempt made inside the exam window as the exam', async () => {
    const client = withExamDoor([practice('in-window', '2026-08-20T05:00:00Z', '2026-08-20T05:30:00Z')]);

    const [view] = await listStudentExams('stu-1', 'c1', client as never);
    expect(view.attempted).toBe(true);
    expect(view.attempt_id).toBe('in-window');
  });

  it('does not count a chapter practised the week before as the exam', async () => {
    const client = withExamDoor([practice('early', '2026-08-13T05:00:00Z', '2026-08-13T05:30:00Z')]);

    const [view] = await listStudentExams('stu-1', 'c1', client as never);
    expect(view.attempted).toBe(false);
    expect(view.attempt_id).toBeNull();
  });
});
