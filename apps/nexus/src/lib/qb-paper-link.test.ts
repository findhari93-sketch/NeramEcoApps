import { describe, it, expect } from 'vitest';
import { paperBackHref, paperHref, paperQuestionHref, readPaperDeepLink } from './qb-paper-link';

describe('paperQuestionHref', () => {
  it('opens one question of a paper', () => {
    expect(paperQuestionHref('p1', 'q31')).toBe('/teacher/question-bank/papers/p1?q=q31');
  });

  it('can open it in Videos mode, where a video is fixed', () => {
    expect(paperQuestionHref('p1', 'q31', 'videos')).toBe('/teacher/question-bank/papers/p1?q=q31&mode=videos');
  });
});

describe('readPaperDeepLink', () => {
  it('reads back what the href wrote', () => {
    expect(readPaperDeepLink(new URLSearchParams('q=q31&mode=videos'))).toEqual({ questionId: 'q31', mode: 'videos', stage: null });
  });

  it('ignores a mode it does not know', () => {
    expect(readPaperDeepLink(new URLSearchParams('q=q31&mode=delete'))).toEqual({ questionId: 'q31', mode: null, stage: null });
  });

  it('is empty without a question', () => {
    expect(readPaperDeepLink(new URLSearchParams(''))).toEqual({ questionId: null, mode: null, stage: null });
  });
});

describe('the exam page card, carried through the paper for Back', () => {
  it('links a paper with the card it was opened from, and without one', () => {
    expect(paperHref('p1', 'done')).toBe('/teacher/question-bank/papers/p1?stage=done');
    expect(paperHref('p1', null)).toBe('/teacher/question-bank/papers/p1');
  });

  it('reads the card back and returns to it', () => {
    const { stage } = readPaperDeepLink(new URLSearchParams('stage=done'));
    expect(stage).toBe('done');
    expect(paperBackHref('/teacher/question-bank/jee-paper-2', stage)).toBe('/teacher/question-bank/jee-paper-2?stage=done');
    expect(paperBackHref('/teacher/question-bank/jee-paper-2', null)).toBe('/teacher/question-bank/jee-paper-2');
  });
});
