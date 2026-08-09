import { describe, it, expect } from 'vitest';
import { sectionBreakdown, finaliseExamScore, effectiveAttemptScore } from './exam-score';

const q = (id: string, section: string | null, marks: number) => ({
  question_id: id,
  section,
  section_order: section === 'math_mcq' ? 1 : section === 'aptitude' ? 3 : section === 'drawing' ? 4 : null,
  marks,
});
const r = (id: string, awarded: number, gradable = true, selected: string | null = 'a') => ({
  question_id: id,
  marks_awarded: awarded,
  is_gradable: gradable,
  selected,
});

describe('sectionBreakdown', () => {
  it('scores each section against only its own machine-markable marks', () => {
    const out = sectionBreakdown(
      [q('m1', 'math_mcq', 4), q('m2', 'math_mcq', 4), q('a1', 'aptitude', 4)],
      [r('m1', 4), r('m2', -1), r('a1', 4)],
    );

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ section: 'math_mcq', score: 3, total_marks: 8, answered: 2 });
    expect(out[1]).toMatchObject({ section: 'aptitude', score: 4, total_marks: 4 });
  });

  it('orders sections the way the paper is sat', () => {
    const out = sectionBreakdown(
      [q('d1', 'drawing', 50), q('a1', 'aptitude', 4), q('m1', 'math_mcq', 4)],
      [r('d1', 0, false, null), r('a1', 4), r('m1', 4)],
    );
    expect(out.map((s) => s.section)).toEqual(['math_mcq', 'aptitude', 'drawing']);
  });

  it('keeps an unmarked drawing out of its section total rather than failing it', () => {
    // "0 of 0, 1 awaiting review", never "0 of 50".
    const out = sectionBreakdown([q('d1', 'drawing', 50)], [r('d1', 0, false, 'https://img')]);

    expect(out[0]).toMatchObject({
      section: 'drawing',
      score: 0,
      total_marks: 0,
      percentage: 0,
      ungraded: 1,
      questions: 1,
      answered: 1,
    });
  });

  it('floors a negatively marked section at zero', () => {
    const out = sectionBreakdown(
      [q('m1', 'math_mcq', 4), q('m2', 'math_mcq', 4)],
      [r('m1', -1), r('m2', -1)],
    );
    expect(out[0].score).toBe(0);
    expect(out[0].percentage).toBe(0);
  });

  it('does not count a blank answer as answered', () => {
    const out = sectionBreakdown([q('m1', 'math_mcq', 4)], [r('m1', 0, true, '')]);
    expect(out[0].answered).toBe(0);
  });

  it('groups unsectioned questions last', () => {
    const out = sectionBreakdown([q('x', null, 1), q('m1', 'math_mcq', 4)], [r('x', 1), r('m1', 4)]);
    expect(out.map((s) => s.label)).toEqual(['Mathematics (MCQ)', 'Unsectioned']);
  });

  it('treats a served question with no review row as ungraded', () => {
    const out = sectionBreakdown([q('m1', 'math_mcq', 4)], []);
    expect(out[0]).toMatchObject({ questions: 1, ungraded: 1, total_marks: 0 });
  });

  it('sums back to the whole paper', () => {
    const questions = [q('m1', 'math_mcq', 4), q('a1', 'aptitude', 4), q('a2', 'aptitude', 4)];
    const review = [r('m1', 4), r('a1', 4), r('a2', 4)];
    const out = sectionBreakdown(questions, review);
    expect(out.reduce((s, x) => s + x.score, 0)).toBe(12);
    expect(out.reduce((s, x) => s + x.total_marks, 0)).toBe(12);
  });
});

describe('finaliseExamScore', () => {
  const objective = { score: 60, total_marks: 100 };

  it('leaves an ungraded drawing out of both the numerator and the denominator', () => {
    const out = finaliseExamScore({
      objective,
      drawings: [{ question_id: 'd1', max_marks: 50, awarded: null }],
    });

    expect(out).toMatchObject({ score: 60, total_marks: 100, percentage: 60, ungraded: 1 });
  });

  it('moves the percentage as drawings land', () => {
    const half = finaliseExamScore({
      objective,
      drawings: [
        { question_id: 'd1', max_marks: 50, awarded: 40 },
        { question_id: 'd2', max_marks: 50, awarded: null },
      ],
    });
    expect(half).toMatchObject({ score: 100, total_marks: 150, ungraded: 1 });

    const full = finaliseExamScore({
      objective,
      drawings: [
        { question_id: 'd1', max_marks: 50, awarded: 40 },
        { question_id: 'd2', max_marks: 50, awarded: 30 },
      ],
    });
    expect(full).toMatchObject({ score: 130, total_marks: 200, percentage: 65, ungraded: 0 });
  });

  it('never lets one forgotten drawing make a paper unpassable', () => {
    // 60/100 stays 60%, not 60/150 = 40%.
    const out = finaliseExamScore({
      objective,
      drawings: [{ question_id: 'd1', max_marks: 50, awarded: null }],
    });
    expect(out.percentage).toBe(60);
  });

  it('clamps a drawing mark to its maximum and to zero', () => {
    expect(
      finaliseExamScore({ objective, drawings: [{ question_id: 'd', max_marks: 50, awarded: 999 }] }).score,
    ).toBe(110);
    expect(
      finaliseExamScore({ objective, drawings: [{ question_id: 'd', max_marks: 50, awarded: -20 }] }).score,
    ).toBe(60);
  });

  it('reports zero ungraded for a paper with no drawings at all', () => {
    expect(finaliseExamScore({ objective, drawings: [] })).toMatchObject({
      score: 60,
      total_marks: 100,
      percentage: 60,
      ungraded: 0,
    });
  });

  it('survives a paper worth nothing', () => {
    expect(
      finaliseExamScore({ objective: { score: 0, total_marks: 0 }, drawings: [] }).percentage,
    ).toBe(0);
  });
});

describe('effectiveAttemptScore', () => {
  it('reads the objective columns and says so while drawings are outstanding', () => {
    expect(
      effectiveAttemptScore({ score: 60, total_marks: 100, percentage: 60, finalised_at: null }),
    ).toEqual({ score: 60, total_marks: 100, percentage: 60, provisional: true });
  });

  it('switches to the final columns once finalised', () => {
    expect(
      effectiveAttemptScore({
        score: 60,
        total_marks: 100,
        percentage: 60,
        final_score: 130,
        final_total_marks: 200,
        final_percentage: 65,
        finalised_at: '2026-08-20T13:00:00Z',
      }),
    ).toEqual({ score: 130, total_marks: 200, percentage: 65, provisional: false });
  });

  it('never returns undefined for a half-populated attempt', () => {
    expect(effectiveAttemptScore({})).toEqual({
      score: 0,
      total_marks: 0,
      percentage: 0,
      provisional: true,
    });
  });
});
