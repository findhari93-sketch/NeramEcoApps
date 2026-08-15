import { describe, it, expect } from 'vitest';
import { examResultChip, type StudentTest } from './StudentTestCard';

/**
 * Where a student's exam result stands is the one genuinely new piece of logic
 * this card gained: absent, provisional, not published yet, or a rank. Each
 * has a different wrong-if-swapped failure (an absent student shown a rank of
 * "- of 42" reads as a real result), so each state gets its own case.
 */

const baseExam: StudentTest = {
  id: 't1',
  title: 'Model Test 3',
  description: null,
  folder_label: null,
  question_count: 50,
  test_type: 'timed',
  duration_minutes: 120,
  placement_id: 'p1',
  passing_pct: 40,
  available_from: null,
  available_until: null,
  attempt_limit: 1,
  attempts: 1,
  best_percentage: 80,
  last_submitted_at: '2026-08-01T00:00:00Z',
  status: 'done',
  is_exam: true,
};

describe('examResultChip', () => {
  it('is null on an ordinary (non-exam) test, however it is scored', () => {
    expect(examResultChip({ ...baseExam, is_exam: false, exam_result: null })).toBeNull();
  });

  it('is null on an exam that has not been attempted yet', () => {
    expect(examResultChip({ ...baseExam, status: 'open', exam_result: null })).toBeNull();
  });

  it('says the result is not published yet once attempted, before results_state moves', () => {
    const chip = examResultChip({ ...baseExam, status: 'done', exam_result: null });
    expect(chip).toEqual({ label: 'Result not published yet', color: 'default' });
  });

  it('shows the rank once a final result exists', () => {
    const chip = examResultChip({
      ...baseExam,
      exam_result: { rank: 3, total_ranked: 42, score: 80, total_marks: 100, percentage: 80, is_provisional: false, absent: false },
    });
    expect(chip).toEqual({ label: 'Rank 3 of 42', color: 'success' });
  });

  it('marks a provisional result distinctly from a final one', () => {
    const chip = examResultChip({
      ...baseExam,
      exam_result: { rank: 3, total_ranked: 42, score: 80, total_marks: 100, percentage: 80, is_provisional: true, absent: false },
    });
    expect(chip).toEqual({ label: 'Rank 3 of 42 · Provisional', color: 'warning' });
  });

  // The one state that must never be confused with a real result: an absent
  // student shown "Rank - of 42" would read as a genuine, if poor, sitting.
  it('says Absent rather than a rank when the student did not sit it', () => {
    const chip = examResultChip({
      ...baseExam,
      exam_result: { rank: null, total_ranked: 42, score: null, total_marks: 100, percentage: null, is_provisional: false, absent: true },
    });
    expect(chip).toEqual({ label: 'Absent', color: 'error' });
  });
});
