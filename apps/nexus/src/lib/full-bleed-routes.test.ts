import { describe, expect, it } from 'vitest';
import { isChromelessRoute, isFullBleedRoute } from './full-bleed-routes';

describe('isFullBleedRoute', () => {
  it.each([
    '/teacher/timetable',
    '/student/timetable/',
    '/teacher/question-bank/papers/abc-123',
    '/teacher/drawing-reviews/ae50645f-40d9-4d1b-98d1-bad59719b70b',
    '/teacher/drawing-reviews/ae50645f-40d9-4d1b-98d1-bad59719b70b/',
    '/student/assignments/3202eea6-89e7-4faf-b8d1-863c03060cce',
    '/student/assignments/3202eea6-89e7-4faf-b8d1-863c03060cce/',
  ])('opts %s out of the container', (path) => {
    expect(isFullBleedRoute(path)).toBe(true);
  });

  it.each([
    '/teacher/drawing-reviews',
    '/teacher/drawing-reviews/profile',
    '/teacher/drawing-reviews/abc/extra',
    '/teacher/question-bank/papers/overview',
    '/teacher/assignments/abc',
    '/student/assignments',
    '/student/assignments/',
    '/student/assignments/abc/extra',
    null,
    undefined,
  ])('keeps %s in the container', (path) => {
    expect(isFullBleedRoute(path)).toBe(false);
  });
});

describe('isChromelessRoute', () => {
  it('only drops chrome for focus mode', () => {
    expect(isChromelessRoute('/student/focus/abc')).toBe(true);
    expect(isChromelessRoute('/teacher/drawing-reviews/abc')).toBe(false);
  });
});
