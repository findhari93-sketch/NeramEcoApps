import { describe, expect, it } from 'vitest';
import { getComposedTestQuestions } from './test-repository';

/**
 * The solution video in a test review.
 *
 * Tests only reference bank questions, so the video is read live from the bank
 * row. It belongs to the answer key: attached on the grading path (withAnswers)
 * and never on the paper a student is sitting.
 */

const TEST_ROWS = [
  { id: 'tq1', qb_question_id: 'q1', question_id: null, marks: 4, negative_marks: 1, section: null, section_order: null, sort_order: 0 },
  { id: 'tq2', qb_question_id: 'q2', question_id: null, marks: 50, negative_marks: 0, section: null, section_order: null, sort_order: 1 },
  { id: 'tq3', qb_question_id: 'q3', question_id: null, marks: 4, negative_marks: 1, section: null, section_order: null, sort_order: 2 },
];

const BANK_ROWS = [
  {
    id: 'q1',
    question_text: 'Find x',
    question_format: 'MCQ',
    options: [],
    correct_answer: 'a',
    solution_video_url: 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ',
    drawing_parts: null,
  },
  {
    id: 'q2',
    question_text: 'Draw a market OR a harbour',
    question_format: 'DRAWING_PROMPT',
    options: null,
    correct_answer: null,
    // The mirror of part A, as mirroredPartSolution writes it.
    solution_video_url: 'https://v/a',
    drawing_parts: {
      mode: 'any_one',
      items: [
        { id: 'a', label: 'A', text: 'Draw a market', solution_video_url: 'https://v/a' },
        { id: 'b', label: 'B', text: 'Draw a harbour', solution_video_url: 'https://v/b' },
      ],
    },
  },
  { id: 'q3', question_text: 'No video here', question_format: 'MCQ', options: [], correct_answer: 'b', solution_video_url: null, drawing_parts: null },
];

function stubClient() {
  return {
    from(table: string) {
      const rows = table === 'nexus_test_questions' ? TEST_ROWS : table === 'nexus_qb_questions' ? BANK_ROWS : [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(ok, no),
      };
      return chain;
    },
  } as never;
}

describe('getComposedTestQuestions: solution videos', () => {
  it('attaches the video to the answer key', async () => {
    const [q1, , q3] = await getComposedTestQuestions('t-1', true, stubClient());
    expect(q1.solution_videos).toEqual([
      { label: null, url: 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ' },
    ]);
    expect(q3.solution_videos).toEqual([]);
  });

  it('lists a split drawing per part while its parts stay stripped', async () => {
    const [, q2] = await getComposedTestQuestions('t-1', true, stubClient());
    expect(q2.solution_videos).toEqual([
      { label: 'A', url: 'https://v/a' },
      { label: 'B', url: 'https://v/b' },
    ]);
    // The parts object itself still never carries a solution.
    expect(JSON.stringify(q2.drawing_parts)).not.toContain('https://');
  });

  it('never puts a video on the paper a student is sitting', async () => {
    const paper = await getComposedTestQuestions('t-1', false, stubClient());
    for (const q of paper) {
      expect(q).not.toHaveProperty('solution_videos');
      expect(JSON.stringify(q)).not.toContain('https://');
    }
  });
});
