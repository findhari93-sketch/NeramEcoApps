import { describe, it, expect } from 'vitest';
import {
  RESULT_QUERY_REASONS,
  explainExamResult,
  renderFactsForTeacher,
  resultQueryRequiresNote,
  type ExplainInput,
} from './exam-result-explain';

const input = (over: Partial<ExplainInput> = {}): ExplainInput => ({
  examTitle: 'History of Architecture Test',
  snapshot: {
    attemptId: 'a1',
    score: 43,
    totalMarks: 50,
    percentage: 86,
    rank: 8,
    sitting: 'main',
    isProvisional: false,
    absent: false,
  },
  sittingSize: 18,
  attempts: [
    { id: 'a1', attemptNumber: 1, percentage: 86, startedAt: '2026-08-18T04:30:00Z', submittedAt: '2026-08-18T05:17:00Z', mode: 'official' },
  ],
  passingPctNow: 40,
  ...over,
});

describe('explainExamResult', () => {
  it('names the attempt the snapshot actually points at', () => {
    const facts = explainExamResult(
      input({
        snapshot: { ...input().snapshot, attemptId: 'a2' },
        attempts: [
          { id: 'a1', attemptNumber: 1, percentage: 91, startedAt: null, submittedAt: '2026-09-11T06:00:00Z', mode: 'practice' },
          { id: 'a2', attemptNumber: 2, percentage: 86, startedAt: null, submittedAt: '2026-08-18T05:17:00Z', mode: 'official' },
        ],
      }),
    );
    expect(facts.counted?.attemptNumber).toBe(2);
    expect(facts.otherAttempts.map((a) => a.attemptNumber)).toEqual([1]);
  });

  // The founder predicted this one by name: "I scored more but the percentage
  // shows less". It is real whenever a paper was reopened or made up.
  it('flags an attempt that scored higher than the one counted', () => {
    const facts = explainExamResult(
      input({
        attempts: [
          { id: 'a1', attemptNumber: 1, percentage: 86, startedAt: null, submittedAt: '2026-08-18T05:17:00Z', mode: 'official' },
          { id: 'a2', attemptNumber: 2, percentage: 91, startedAt: null, submittedAt: '2026-09-11T06:00:00Z', mode: 'official' },
        ],
      }),
    );
    expect(facts.otherAttempts).toHaveLength(1);
    expect(facts.otherAttempts[0].higherThanCounted).toBe(true);
  });

  it('does not call a lower attempt higher', () => {
    const facts = explainExamResult(
      input({
        attempts: [
          { id: 'a1', attemptNumber: 1, percentage: 86, startedAt: null, submittedAt: null, mode: 'official' },
          { id: 'a2', attemptNumber: 2, percentage: 40, startedAt: null, submittedAt: null, mode: 'practice' },
        ],
      }),
    );
    expect(facts.otherAttempts[0].higherThanCounted).toBe(false);
  });

  it('carries the sitting, because a rank only means anything inside one', () => {
    const facts = explainExamResult(input({ snapshot: { ...input().snapshot, sitting: 'second', rank: 2 }, sittingSize: 4 }));
    expect(facts.rank).toEqual({ position: 2, outOf: 4, sitting: 'second' });
  });

  it('reports an absent student as absent rather than as a zero', () => {
    const facts = explainExamResult(
      input({ snapshot: { ...input().snapshot, attemptId: null, score: null, totalMarks: null, percentage: null, rank: null, absent: true } }),
    );
    expect(facts.absent).toBe(true);
    expect(facts.marks).toBeNull();
    expect(facts.counted).toBeNull();
  });

  it('keeps the provisional flag, which is the answer to half of these', () => {
    expect(explainExamResult(input({ snapshot: { ...input().snapshot, isProvisional: true } })).provisional).toBe(true);
  });
});

describe('renderFactsForTeacher', () => {
  const said = 'my marks look wrong';

  it('shows the arithmetic, so "why is my percentage 86" answers itself', () => {
    const out = renderFactsForTeacher(explainExamResult(input()), 'Kaveya', said);
    expect(out).toContain('Kaveya');
    expect(out).toContain('43 / 50 = 86%');
    expect(out).toContain('Rank: 8 of 18');
  });

  it('explains the higher attempt rather than leaving the teacher to find it', () => {
    const facts = explainExamResult(
      input({
        attempts: [
          { id: 'a1', attemptNumber: 1, percentage: 86, startedAt: null, submittedAt: '2026-08-18T05:17:00Z', mode: 'official' },
          { id: 'a2', attemptNumber: 2, percentage: 91, startedAt: null, submittedAt: '2026-09-11T06:00:00Z', mode: 'official' },
        ],
      }),
    );
    const out = renderFactsForTeacher(facts, 'Kaveya', said);
    expect(out).toContain('HIGHER than the one counted');
    expect(out).toContain('first submitted attempt');
  });

  // shortDate formatting an IST instant without a timeZone has already shipped a
  // bug on this project, where a parent notice read a day early.
  it('writes times in IST, not in whatever zone the server is in', () => {
    const out = renderFactsForTeacher(explainExamResult(input()), 'Kaveya', said);
    // 2026-08-18T05:17:00Z is 10:47 in Asia/Kolkata, and 18 Aug either way.
    expect(out).toContain('18 Aug 2026');
    expect(out).toContain('10:47');
  });

  it('says a student was absent instead of printing a zero', () => {
    const facts = explainExamResult(
      input({ snapshot: { ...input().snapshot, attemptId: null, score: null, totalMarks: null, percentage: null, rank: null, absent: true } }),
    );
    expect(renderFactsForTeacher(facts, 'Kaveya', said)).toContain('Marked absent');
  });

  it('uses no em dash or double dash, because a teacher forwards this', () => {
    expect(renderFactsForTeacher(explainExamResult(input()), 'Kaveya', said)).not.toMatch(/—|--|&mdash;/);
  });
});

describe('the reasons a student can pick', () => {
  it('asks for a note only where the answer is useless without one', () => {
    expect(resultQueryRequiresNote('question_marked_wrong')).toBe(true);
    expect(resultQueryRequiresNote('something_else')).toBe(true);
    expect(resultQueryRequiresNote('marks_wrong')).toBe(false);
    expect(resultQueryRequiresNote('not_a_code')).toBe(false);
  });

  it('offers the one the product actually gets wrong', () => {
    expect(RESULT_QUERY_REASONS.map((r) => r.code)).toContain('wrong_attempt');
  });

  it('uses no em dash in anything a student reads', () => {
    for (const r of RESULT_QUERY_REASONS) expect(r.label).not.toMatch(/—|--|&mdash;/);
  });
});
