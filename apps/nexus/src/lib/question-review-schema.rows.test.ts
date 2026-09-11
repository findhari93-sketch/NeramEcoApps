import { describe, it, expect } from 'vitest';
import { buildReviewRows, type ReviewRowInput } from './question-review-schema';

/**
 * Turning an AI reply into the check history a question carries.
 *
 * Every question the reply judged gets a row, whether or not the teacher
 * applied anything. That is the point: "checked, nothing wrong" is exactly the
 * fact that stops the same question being sent to an AI a second time.
 */

function input(over: Partial<ReviewRowInput> = {}): ReviewRowInput {
  return {
    reviews: [],
    onThisTest: new Set(['q1', 'q2']),
    applied: new Map(),
    snapshot: new Map(),
    testId: 't1',
    placementId: 'run-1',
    reviewedBy: 'teacher-1',
    ...over,
  };
}

describe('buildReviewRows', () => {
  it('records a check for every judged question, fixed or not', () => {
    const rows = buildReviewRows(
      input({
        reviews: [
          { question_id: 'q1', verdict: 'wrong_key', note: 'Key should be Bronze Age.' },
          { question_id: 'q2', verdict: 'fine', note: '' },
        ],
      }),
    );

    expect(rows.map((r) => [r.questionId, r.verdict])).toEqual([
      ['q1', 'wrong_key'],
      ['q2', 'fine'],
    ]);
    expect(rows[1].appliedFields).toEqual([]);
    expect(rows[1].note).toBeNull();
  });

  it('carries the fields applied and the audit row they were written through', () => {
    const [row] = buildReviewRows(
      input({
        reviews: [{ question_id: 'q1', verdict: 'wrong_key' }],
        applied: new Map([['q1', { fields: ['correct_answer', 'explanation_brief'], editId: 'e1' }]]),
      }),
    );

    expect(row.appliedFields).toEqual(['correct_answer', 'explanation_brief']);
    expect(row.editId).toBe('e1');
    expect(row).toMatchObject({ testId: 't1', placementId: 'run-1', reviewedBy: 'teacher-1' });
  });

  it('keeps the correct rate the teacher saw before a fix moved it', () => {
    const [row] = buildReviewRows(
      input({
        reviews: [{ question_id: 'q1', verdict: 'wrong_key' }],
        snapshot: new Map([['q1', { correct_pct: 0, answered: 9 }]]),
      }),
    );

    expect(row.correctPctAtCheck).toBe(0);
    expect(row.answeredAtCheck).toBe(9);
  });

  it('drops a question that is not on this test', () => {
    const rows = buildReviewRows(input({ reviews: [{ question_id: 'q-elsewhere', verdict: 'fine' }] }));
    expect(rows).toEqual([]);
  });

  it('drops an unknown verdict rather than guessing one', () => {
    const rows = buildReviewRows(input({ reviews: [{ question_id: 'q1', verdict: 'probably_ok' }] }));
    expect(rows).toEqual([]);
  });

  it('records a question once even when the reply names it twice', () => {
    const rows = buildReviewRows(
      input({
        reviews: [
          { question_id: 'q1', verdict: 'ambiguous' },
          { question_id: 'q1', verdict: 'fine' },
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe('ambiguous');
  });

  it('trims the note and caps its length', () => {
    const [row] = buildReviewRows(
      input({ reviews: [{ question_id: 'q1', verdict: 'fine', note: `   ${'x'.repeat(500)}   ` }] }),
    );
    expect(row.note?.startsWith('x')).toBe(true);
    expect(row.note!.length).toBeLessThanOrEqual(300);
  });
});
