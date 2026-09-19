import { describe, it, expect } from 'vitest';
import {
  countStages,
  isWorkStage,
  paperWorkStage,
  queryWorkRows,
  sittingLabel,
  toWorkRows,
  type WorkPaper,
} from './paperWorkStage';

function makePaper(overrides: Partial<WorkPaper> = {}): WorkPaper {
  return {
    id: 'p1',
    exam_type: 'JEE_PAPER_2',
    year: 2024,
    session: null,
    shift: null,
    pdf_url: null,
    total_questions: null,
    total_marks: null,
    duration_minutes: null,
    uploaded_by: null,
    upload_status: 'parsed',
    questions_parsed: 0,
    questions_answer_keyed: 0,
    questions_complete: 0,
    created_at: '2026-03-25T07:00:00.000Z',
    study_file_id: null,
    is_student_visible: false,
    paper_source: 'official',
    exam_date: null,
    contributor_summary: [],
    solvable_count: 0,
    solution_count: 0,
    ...overrides,
  } as WorkPaper;
}

/** A paper with every question keyed and solved. */
const finished = (overrides: Partial<WorkPaper> = {}) =>
  makePaper({
    questions_parsed: 80,
    questions_answer_keyed: 80,
    questions_complete: 80,
    solvable_count: 78,
    solution_count: 78,
    ...overrides,
  });

describe('paperWorkStage', () => {
  it('asks for questions before anything else, even with a PDF linked', () => {
    const [row] = toWorkRows([makePaper({ study_file_id: 'f1' })]);
    expect(row.stage).toBe('needsQuestions');
  });

  it('asks for the answer key while any question lacks one', () => {
    const [row] = toWorkRows([finished({ questions_answer_keyed: 74 })]);
    expect(row.stage).toBe('needsAnswers');
  });

  it('asks for solutions once keyed, and only for questions that can have one', () => {
    const [row] = toWorkRows([finished({ solution_count: 70 })]);
    expect(row.stage).toBe('needsSolutions');
  });

  it('skips solutions for a paper with nothing solvable', () => {
    const [row] = toWorkRows([
      finished({ solvable_count: 0, solution_count: 0 }),
    ]);
    expect(row.stage).toBe('readyToPublish');
  });

  it('keeps a live paper with gaps on the to-do list', () => {
    // The screenshot case: 2007 is live for students with 88 of 90 keyed.
    const [row] = toWorkRows([
      finished({ questions_parsed: 90, questions_answer_keyed: 88, is_student_visible: true }),
    ]);
    expect(row.stage).toBe('needsAnswers');
  });

  it('calls a paper done only when it is complete and live', () => {
    expect(toWorkRows([finished({ is_student_visible: false })])[0].stage).toBe('readyToPublish');
    expect(toWorkRows([finished({ is_student_visible: true })])[0].stage).toBe('done');
  });

  it('never lets a solution count past its denominator', () => {
    const [row] = toWorkRows([finished({ solvable_count: 10, solution_count: 12 })]);
    expect(row.solved).toBe(10);
    expect(row.readiness).toBeLessThanOrEqual(1);
  });

  it('is exported as a pure function of its inputs', () => {
    expect(paperWorkStage({ is_student_visible: true }, { total: 0, keyed: 0 }, 0, 0)).toBe('needsQuestions');
  });
});

describe('queryWorkRows', () => {
  const rows = toWorkRows([
    finished({ id: 'done-2013', year: 2013, is_student_visible: true }),
    finished({ id: 'solutions-2020', year: 2020, solution_count: 10 }),
    makePaper({ id: 'empty-2018', year: 2018 }),
    finished({ id: 'answers-2026', year: 2026, questions_answer_keyed: 74 }),
    finished({ id: 'answers-2022', year: 2022, questions_answer_keyed: 2 }),
    finished({ id: 'publish-2014', year: 2014 }),
  ]);

  it('shows every unfinished paper by default, least finished first, newest year within a stage', () => {
    expect(queryWorkRows(rows, null).map((r) => r.paper.id)).toEqual([
      'empty-2018',
      'answers-2026',
      'answers-2022',
      'solutions-2020',
      'publish-2014',
    ]);
  });

  it('shows only the chosen stage when one is picked, done included', () => {
    expect(queryWorkRows(rows, 'done').map((r) => r.paper.id)).toEqual(['done-2013']);
    expect(queryWorkRows(rows, 'needsAnswers').map((r) => r.paper.id)).toEqual([
      'answers-2026',
      'answers-2022',
    ]);
  });

  it('orders two sittings of one year forenoon first', () => {
    const sittings = toWorkRows([
      makePaper({ id: 'an', year: 2022, session: 'Session 2', shift: 'afternoon' }),
      makePaper({ id: 'fn', year: 2022, session: 'Session 2', shift: 'forenoon' }),
    ]);
    expect(queryWorkRows(sittings, null).map((r) => r.paper.id)).toEqual(['fn', 'an']);
  });

  it('counts every stage, so a card can show zero', () => {
    expect(countStages(rows)).toEqual({
      needsQuestions: 1,
      needsAnswers: 2,
      needsSolutions: 1,
      readyToPublish: 1,
      done: 1,
    });
    expect(countStages([])).toEqual({
      needsQuestions: 0,
      needsAnswers: 0,
      needsSolutions: 0,
      readyToPublish: 0,
      done: 0,
    });
  });
});

describe('helpers', () => {
  it('accepts only real stages from the URL', () => {
    expect(isWorkStage('needsSolutions')).toBe(true);
    expect(isWorkStage('live')).toBe(false);
    expect(isWorkStage(null)).toBe(false);
  });

  it('names a sitting the way the teacher rows always have', () => {
    expect(sittingLabel({ session: 'Session 1', shift: 'forenoon' })).toBe('Session 1 (FN)');
    expect(sittingLabel({ session: 'Session 2', shift: null })).toBe('Session 2');
    expect(sittingLabel({ session: null, shift: null })).toBeNull();
  });
});
