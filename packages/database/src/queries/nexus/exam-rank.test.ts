import { describe, it, expect } from 'vitest';
import { rankExamCandidates, type ExamCandidate } from './exam-results';
import { resolveExamWindowForStudent } from './exams';

const candidate = (
  id: string,
  name: string,
  percentage: number,
  time: number | null = 100,
  absent = false,
): ExamCandidate => ({
  student_id: id,
  student_name: name,
  attempt_id: absent ? null : `a-${id}`,
  score: percentage,
  total_marks: 100,
  percentage,
  provisional: false,
  absent,
  time_spent_seconds: time,
  section_scores: [],
});

describe('rankExamCandidates', () => {
  it('ranks by percentage, highest first', () => {
    const out = rankExamCandidates([
      candidate('a', 'Arun', 60),
      candidate('b', 'Bhavya', 90),
      candidate('c', 'Chitra', 75),
    ]);
    expect(out.map((r) => r.student_name)).toEqual(['Bhavya', 'Chitra', 'Arun']);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('shares a rank on a genuine tie rather than picking a winner', () => {
    // Telling two students with identical marks that one beat the other is not
    // true, and it is exactly the thing that ends up in a parent's message.
    const out = rankExamCandidates([
      candidate('a', 'Arun', 90, 200),
      candidate('b', 'Bhavya', 90, 100),
      candidate('c', 'Chitra', 50),
    ]);
    expect(out.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('orders a tie by the faster paper, without separating their ranks', () => {
    const out = rankExamCandidates([
      candidate('a', 'Arun', 90, 300),
      candidate('b', 'Bhavya', 90, 120),
    ]);
    expect(out[0].student_name).toBe('Bhavya');
    expect(out[0].rank).toBe(1);
    expect(out[1].rank).toBe(1);
  });

  it('falls back to the name so two identical papers still order the same way twice', () => {
    const first = rankExamCandidates([candidate('a', 'Zed', 70, 100), candidate('b', 'Ana', 70, 100)]);
    const second = rankExamCandidates([candidate('b', 'Ana', 70, 100), candidate('a', 'Zed', 70, 100)]);
    expect(first.map((r) => r.student_name)).toEqual(second.map((r) => r.student_name));
    expect(first[0].student_name).toBe('Ana');
  });

  it('treats a missing time as slowest rather than fastest', () => {
    const out = rankExamCandidates([candidate('a', 'Arun', 90, null), candidate('b', 'Bhavya', 90, 60)]);
    expect(out[0].student_name).toBe('Bhavya');
  });

  it('never ranks an absent student, and lists them last', () => {
    const out = rankExamCandidates([
      candidate('a', 'Arun', 0, null, true),
      candidate('b', 'Bhavya', 40),
    ]);
    expect(out[0]).toMatchObject({ student_name: 'Bhavya', rank: 1 });
    expect(out[1]).toMatchObject({ student_name: 'Arun', rank: null, absent: true });
  });

  it('treats a candidate with no attempt as absent even if not flagged', () => {
    const noAttempt = { ...candidate('a', 'Arun', 0), attempt_id: null };
    expect(rankExamCandidates([noAttempt])[0].rank).toBeNull();
  });

  it('survives an empty exam', () => {
    expect(rankExamCandidates([])).toEqual([]);
  });
});

describe('resolveExamWindowForStudent', () => {
  const exam = { opens_at: '2026-08-20T04:30:00Z', closes_at: '2026-08-20T07:30:00Z' };
  const makeup = {
    id: 'm1',
    exam_id: 'e1',
    student_id: 's1',
    opens_at: '2026-08-22T04:30:00Z',
    closes_at: '2026-08-22T07:30:00Z',
    reason: null,
    granted_by: null,
    granted_at: '2026-08-21T00:00:00Z',
    revoked_at: null,
    source: 'teacher_grant' as const,
  };

  it('uses the exam window when there is no grant', () => {
    expect(resolveExamWindowForStudent(exam, null)).toEqual({ ...exam, is_makeup: false, is_reopen: false });
  });

  it('a live grant REPLACES the window rather than extending it', () => {
    // Otherwise a student granted Thursday could sit it on Tuesday as well.
    const out = resolveExamWindowForStudent(exam, makeup);
    expect(out).toEqual({
      opens_at: makeup.opens_at,
      closes_at: makeup.closes_at,
      is_makeup: true,
      is_reopen: false,
    });
  });

  it('ignores a revoked grant entirely', () => {
    const revoked = { ...makeup, revoked_at: '2026-08-21T12:00:00Z' };
    expect(resolveExamWindowForStudent(exam, revoked)).toEqual({ ...exam, is_makeup: false, is_reopen: false });
  });

  /**
   * THE BUG THIS ARGUMENT WAS ADDED FOR. A teacher pressing "Open for them"
   * writes a granted nexus_test_access_requests row. This function never read
   * it, so the roster showed a live window and the student was still refused,
   * with every screen the teacher could see reporting success.
   */
  it('honours a teacher reopening the exam for one student', () => {
    const reopen = { opens_at: '2026-08-28T00:00:00Z', closes_at: '2026-08-31T00:00:00Z' };
    expect(resolveExamWindowForStudent(exam, null, reopen)).toEqual({
      opens_at: reopen.opens_at,
      closes_at: reopen.closes_at,
      is_makeup: false,
      is_reopen: true,
    });
  });

  /** A reopen answers what actually happened; a makeup was only ever a plan. */
  it('prefers the reopen when a makeup is also live', () => {
    const reopen = { opens_at: '2026-08-28T00:00:00Z', closes_at: '2026-08-31T00:00:00Z' };
    const out = resolveExamWindowForStudent(exam, makeup, reopen);
    expect(out.is_reopen).toBe(true);
    expect(out.closes_at).toBe(reopen.closes_at);
  });

  /**
   * An open-ended grant must not inherit the exam's bounds, or it would
   * re-impose the very window it exists to escape.
   */
  it('treats a grant with no end as open until someone closes it', () => {
    const out = resolveExamWindowForStudent(exam, null, { opens_at: null, closes_at: null });
    expect(Date.parse(out.opens_at)).toBeLessThan(Date.now());
    expect(Date.parse(out.closes_at)).toBeGreaterThan(Date.now());
  });
});
