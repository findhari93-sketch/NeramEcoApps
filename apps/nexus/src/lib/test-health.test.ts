import { describe, expect, it } from 'vitest';
import {
  collectTestIssues,
  hasBlockingIssue,
  reportedIssues,
  structuralIssues,
  technicalIssues,
  type CheckableQuestion,
} from './test-health';

const q = (over: Partial<CheckableQuestion> = {}): CheckableQuestion => ({
  id: 'q1',
  is_active: true,
  correct_answer: 'a',
  question_text: 'What year?',
  question_image_url: null,
  question_format: 'MCQ',
  options: [{ id: 'a' }, { id: 'b' }],
  ...over,
});

const structural = (questions: CheckableQuestion[], title?: string) =>
  structuralIssues({ question_count: questions.length, questions, title });

describe('structuralIssues', () => {
  it('finds nothing wrong with a healthy paper', () => {
    expect(structural([q(), q({ id: 'q2' })])).toEqual([]);
  });

  /**
   * composeTest refuses to create a paper with no questions, so an empty one
   * means its questions were deleted from the bank afterwards. It is also the
   * only case where reporting anything else would be noise, hence the early
   * return.
   */
  it('reports an empty paper as a single fatal problem and stops there', () => {
    const issues = structuralIssues({ question_count: 0, questions: [], title: 'Practice - 10 questions' });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toContain('no questions');
  });

  it('catches questions deactivated in the bank after the paper was built', () => {
    const issues = structural([q(), q({ id: 'q2', is_active: false })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].count).toBe(1);
    expect(issues[0].title).toContain('removed from the question bank');
  });

  // Ungradeable reads to a student as a wrong answer they cannot argue with.
  it('catches a question with no correct answer', () => {
    const issues = structural([q({ correct_answer: null }), q({ id: 'q2', correct_answer: '  ' })]);
    expect(issues.some((i) => i.title.includes('no correct answer') && i.count === 2)).toBe(true);
  });

  // A deactivated question is already reported once. Reporting it again for
  // every other check would turn one problem into four.
  it('does not re-report a deactivated question under every other check', () => {
    const issues = structural([q({ is_active: false, correct_answer: null, question_text: null })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('removed from the question bank');
  });

  it('catches a question with neither text nor an image', () => {
    const issues = structural([q({ question_text: '   ', question_image_url: null })]);
    expect(issues.some((i) => i.title.includes('neither text nor an image'))).toBe(true);
  });

  it('accepts an image-only question, which is normal for spatial reasoning', () => {
    const issues = structural([q({ question_text: null, question_image_url: 'https://x/y.png' })]);
    expect(issues).toEqual([]);
  });

  it('catches a multiple-choice question that offers no choice', () => {
    const issues = structural([q({ options: [{ id: 'a' }] })]);
    expect(issues.some((i) => i.title.includes('fewer than two options'))).toBe(true);
  });

  it('does not demand options from a non-choice format', () => {
    expect(structural([q({ question_format: 'NUMERIC', options: null })])).toEqual([]);
  });

  /**
   * The production case: "Practice - 0 questions" sits on a paper holding 544.
   * Harmless to a student sitting it, actively misleading to staff scanning a
   * list, which is exactly who this warning is for.
   */
  it('catches a title that contradicts the question count', () => {
    const issues = structural([q(), q({ id: 'q2' })], 'Practice - 0 questions');
    const mismatch = issues.find((i) => i.title.includes('The name says'));
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('warning');
    expect(mismatch!.title).toContain('holds 2');
  });

  it('says nothing when the title agrees with the paper', () => {
    expect(structural([q(), q({ id: 'q2' })], 'Practice - 2 questions')).toEqual([]);
  });

  it('ignores a title that claims no count at all', () => {
    expect(structural([q()], 'Puzzle Test')).toEqual([]);
  });
});

describe('technicalIssues', () => {
  it('groups failures into one line per phase, commonest first', () => {
    const issues = technicalIssues([
      { phase: 'image' },
      { phase: 'image' },
      { phase: 'image' },
      { phase: 'submit' },
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0].count).toBe(3);
    expect(issues[0].title).toContain('could not load a question image');
  });

  // Losing your submitted answers is categorically worse than one missing
  // figure, and the severities have to reflect that or the panel misleads.
  it('treats load, submit and grade as errors and image as a warning', () => {
    expect(technicalIssues([{ phase: 'load' }])[0].severity).toBe('error');
    expect(technicalIssues([{ phase: 'submit' }])[0].severity).toBe('error');
    expect(technicalIssues([{ phase: 'grade' }])[0].severity).toBe('error');
    expect(technicalIssues([{ phase: 'image' }])[0].severity).toBe('warning');
    expect(technicalIssues([{ phase: 'render' }])[0].severity).toBe('warning');
  });

  it('renders an unrecognised phase rather than dropping it', () => {
    const issues = technicalIssues([{ phase: 'teleport' }]);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('unrecognised error');
  });

  it('says nothing for a paper nothing went wrong with', () => {
    expect(technicalIssues([])).toEqual([]);
  });
});

describe('reportedIssues', () => {
  // A student looked at a question and said it is wrong. That is at least as
  // strong a signal as a machine fault, so it carries the same severity.
  it('treats student reports as errors', () => {
    const issues = reportedIssues([{ report_type: 'wrong_answer' }, { report_type: 'no_correct_option' }]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].count).toBe(2);
  });

  it('says nothing when nobody has reported anything', () => {
    expect(reportedIssues([])).toEqual([]);
  });
});

describe('collectTestIssues', () => {
  it('puts errors above warnings, then the widest impact first', () => {
    const issues = collectTestIssues({
      structural: { question_count: 3, questions: [q(), q({ id: 'q2' }), q({ id: 'q3', options: [{ id: 'a' }] })] },
      errors: [{ phase: 'image' }, { phase: 'image' }, { phase: 'submit' }],
      reports: [{ report_type: 'wrong_answer' }],
    });
    expect(issues.every((i, idx) => idx === 0 || issues[idx - 1].severity <= i.severity)).toBe(true);
    expect(issues[0].severity).toBe('error');
    expect(issues[issues.length - 1].severity).toBe('warning');
  });

  it('combines all three streams', () => {
    const issues = collectTestIssues({
      structural: { question_count: 1, questions: [q({ correct_answer: null })] },
      errors: [{ phase: 'load' }],
      reports: [{ report_type: 'unclear_question' }],
    });
    expect(new Set(issues.map((i) => i.stream))).toEqual(new Set(['structural', 'technical', 'reported']));
  });

  it('returns nothing for a healthy paper with no history', () => {
    expect(collectTestIssues({ structural: { question_count: 1, questions: [q()] } })).toEqual([]);
    expect(collectTestIssues({})).toEqual([]);
  });
});

describe('hasBlockingIssue', () => {
  it('is true when anything is an error', () => {
    expect(hasBlockingIssue(technicalIssues([{ phase: 'submit' }]))).toBe(true);
  });

  it('is false for warnings alone', () => {
    expect(hasBlockingIssue(technicalIssues([{ phase: 'image' }]))).toBe(false);
    expect(hasBlockingIssue([])).toBe(false);
  });
});
