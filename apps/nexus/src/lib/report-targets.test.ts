import { describe, it, expect } from 'vitest';
import { reportTargetsFor, sameReportTarget, reportTargetWord } from './report-targets';

describe('reportTargetsFor', () => {
  it('offers what an MCQ question actually shows, and the question itself last', () => {
    const targets = reportTargetsFor({
      question_format: 'MCQ',
      explanation_brief: 'South-facing slopes.',
      solution_video_url: 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ',
      solution_image_url: null,
      correct_answer: 'b',
    });
    expect(targets.map((t) => t.label)).toEqual(['Video solution', 'Written solution', 'Answer key', 'The question itself']);
  });

  it('leaves out what the question does not have', () => {
    const targets = reportTargetsFor({ question_format: 'MCQ', correct_answer: 'a' });
    expect(targets.map((t) => t.target)).toEqual(['answer_key', 'question']);
  });

  it('offers a drawing its solution image and video, never an answer key', () => {
    const targets = reportTargetsFor({
      question_format: 'DRAWING_PROMPT',
      explanation_brief: 'Part (a): draw a bus stop',
      solution_image_url: 'https://cdn/sol.png',
      solution_video_url: 'https://www.youtube.com/watch?v=T9CB0HymAJo',
      correct_answer: null,
    });
    expect(targets.map((t) => t.target)).toEqual(['video', 'solution_image', 'question']);
  });

  it('offers each part of a split drawing on its own', () => {
    const targets = reportTargetsFor({
      question_format: 'DRAWING_PROMPT',
      drawing_parts: {
        mode: 'any_one',
        items: [
          { id: 'a', label: 'A', text: 'Bus stop', solution_image_url: 'https://cdn/a.png', solution_video_url: null },
          { id: 'b', label: 'B', text: 'Market', solution_image_url: null, solution_video_url: 'https://youtu.be/x' },
        ],
      },
    });
    expect(targets.map((t) => t.label)).toEqual(['Video for part B', 'Solution image for part A', 'The question itself']);
    expect(targets[0]).toMatchObject({ target: 'video', partLabel: 'B' });
  });
});

describe('sameReportTarget', () => {
  it('matches on the part too', () => {
    expect(sameReportTarget({ target: 'video', part_label: null }, { target: 'video', partLabel: null })).toBe(true);
    expect(sameReportTarget({ target: 'video', part_label: 'A' }, { target: 'video', partLabel: 'B' })).toBe(false);
  });
});

describe('reportTargetWord', () => {
  it('names the part in a sentence', () => {
    expect(reportTargetWord('video')).toBe('video');
    expect(reportTargetWord('explanation')).toBe('solution');
  });
});
