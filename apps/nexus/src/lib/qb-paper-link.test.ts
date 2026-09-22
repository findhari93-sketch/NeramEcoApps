import { describe, it, expect } from 'vitest';
import { paperQuestionHref, readPaperDeepLink } from './qb-paper-link';

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
    expect(readPaperDeepLink(new URLSearchParams('q=q31&mode=videos'))).toEqual({ questionId: 'q31', mode: 'videos' });
  });

  it('ignores a mode it does not know', () => {
    expect(readPaperDeepLink(new URLSearchParams('q=q31&mode=delete'))).toEqual({ questionId: 'q31', mode: null });
  });

  it('is empty without a question', () => {
    expect(readPaperDeepLink(new URLSearchParams(''))).toEqual({ questionId: null, mode: null });
  });
});
