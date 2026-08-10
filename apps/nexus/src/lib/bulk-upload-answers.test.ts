import { describe, it, expect } from 'vitest';
import { resolveCorrectAnswer, validateAndConvertJSON } from './bulk-upload-schema';
import type { ReviewQuestionOption } from './bulk-upload-schema';

/**
 * An answer that imports cleanly but resolves to the wrong option does not fail
 * here. It fails months later, marking every student wrong on that question,
 * with nothing in the logs. So the resolution rule gets its own tests.
 *
 * bulkCreateDraftQuestions numbers MCQ options by position ('a' to 'd') and
 * gradeQBAnswerStrict compares against that id, which is why every input shape
 * below has to come out as a lowercase positional letter.
 */

const opts = (...labels: string[]): ReviewQuestionOption[] =>
  labels.map((label) => ({ label, text: `option ${label}` }));

describe('resolveCorrectAnswer', () => {
  it('maps a printed label to the option in that position', () => {
    expect(resolveCorrectAnswer('C', 'MCQ', opts('A', 'B', 'C', 'D')).answer).toBe('c');
  });

  it('accepts the lowercase form', () => {
    expect(resolveCorrectAnswer('c', 'MCQ', opts('A', 'B', 'C', 'D')).answer).toBe('c');
  });

  it('accepts an old paper numbering its options (1) to (4)', () => {
    // Pre-2013 papers print (1),(2),(3),(4). The third option is still 'c'.
    expect(resolveCorrectAnswer('(3)', 'MCQ', opts('(1)', '(2)', '(3)', '(4)')).answer).toBe('c');
  });

  it('resolves by position when the labels do not match the answer style', () => {
    expect(resolveCorrectAnswer('B', 'MCQ', opts('(1)', '(2)', '(3)', '(4)')).answer).toBe('b');
  });

  it('refuses an answer that matches none of the options', () => {
    const r = resolveCorrectAnswer('E', 'MCQ', opts('A', 'B', 'C', 'D'));
    expect(r.answer).toBeUndefined();
    expect(r.problem).toContain('matches none');
  });

  it('never invents an option beyond the ones the question has', () => {
    // Two-option question, answer "D". Silently returning 'd' would key a
    // question against an option that does not exist.
    const r = resolveCorrectAnswer('D', 'MCQ', opts('A', 'B'));
    expect(r.answer).toBeUndefined();
  });

  it('keeps a numerical answer as its value', () => {
    expect(resolveCorrectAnswer('2.5', 'NUMERICAL', []).answer).toBe('2.5');
  });

  it('ignores an answer on a drawing and says why', () => {
    const r = resolveCorrectAnswer('A', 'DRAWING_PROMPT', []);
    expect(r.answer).toBeUndefined();
    expect(r.problem).toContain('no answer key');
  });

  it('treats a missing answer as simply absent, not a problem', () => {
    const r = resolveCorrectAnswer(undefined, 'MCQ', opts('A', 'B'));
    expect(r.answer).toBeUndefined();
    expect(r.problem).toBeUndefined();
  });
});

describe('validateAndConvertJSON with answers', () => {
  const paper = (questions: unknown[]) => ({
    schema_version: '1.0',
    paper: { exam_name: 'JEE Paper 2', total_questions: questions.length },
    sections: [
      { name: 'Mathematics', section_key: 'math_mcq', question_count: questions.length, questions },
    ],
  });

  it('carries an answer through to the review question', () => {
    const result = validateAndConvertJSON(
      paper([
        {
          question_number: 1,
          question_text: 'What is 2 + 2?',
          question_format: 'MCQ',
          options: [
            { label: 'A', text: '3' },
            { label: 'B', text: '4' },
          ],
          correct_answer: 'B',
        },
      ]),
    );
    expect(result.valid).toBe(true);
    expect(result.questions[0].correct_answer).toBe('b');
  });

  it('still imports a file with no answers at all', () => {
    // The separate answer-key paste has to keep working: most papers arrive as
    // a question PDF and a key PDF, days apart.
    const result = validateAndConvertJSON(
      paper([
        {
          question_number: 1,
          question_text: 'What is 2 + 2?',
          question_format: 'MCQ',
          options: [{ label: 'A', text: '3' }, { label: 'B', text: '4' }],
        },
      ]),
    );
    expect(result.valid).toBe(true);
    expect(result.questions[0].correct_answer).toBeUndefined();
  });

  it('keeps the question and warns when one answer cannot be resolved', () => {
    // Dropping the row, or failing the whole file, would lose 91 good questions
    // over one bad letter.
    const result = validateAndConvertJSON(
      paper([
        {
          question_number: 7,
          question_text: 'What is 2 + 2?',
          question_format: 'MCQ',
          options: [{ label: 'A', text: '3' }, { label: 'B', text: '4' }],
          correct_answer: 'Z',
        },
      ]),
    );
    expect(result.valid).toBe(true);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].correct_answer).toBeUndefined();
    expect(result.warnings.some((w) => w.includes('Q7'))).toBe(true);
  });
});
