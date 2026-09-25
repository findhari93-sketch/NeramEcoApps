import { describe, it, expect } from 'vitest';
import {
  isCorrectOption,
  nextTopicWithWork,
  percentOf,
  readOptions,
  safeBackHref,
  splitHighlights,
  TAG_COVERAGE_HOME,
} from './tag-coverage-view';

describe('safeBackHref', () => {
  it('keeps an in-app teacher path', () => {
    expect(safeBackHref('/teacher/tests/new?step=source')).toBe('/teacher/tests/new?step=source');
    expect(safeBackHref('/teacher/question-bank/tags')).toBe('/teacher/question-bank/tags');
  });

  it('refuses anything that could leave the app or the teacher area', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'https://evil.com',
      '//evil.com',
      '/teacher//evil.com',
      '/teacher/\\evil.com',
      '/teacher/x?next=https://evil.com',
      '/student/dashboard',
      '/teachers/x',
      'teacher/tests',
      '/teacher/x\nSet-Cookie: a',
    ]) {
      expect(safeBackHref(bad as string | null), String(bad)).toBe(TAG_COVERAGE_HOME);
    }
  });
});

describe('splitHighlights', () => {
  it('marks whole-word matches, keeping the original spelling', () => {
    expect(splitHighlights("Who designed Humayun's Tomb and the mosques?", ['humayun s tomb', 'mosque'])).toEqual([
      { text: 'Who designed ', hit: false },
      { text: "Humayun's Tomb", hit: true },
      { text: ' and the ', hit: false },
      { text: 'mosques', hit: true },
      { text: '?', hit: false },
    ]);
  });

  it('does not highlight inside a longer word', () => {
    expect(splitHighlights('The domestic Charminar', ['dome', 'minar'])).toEqual([
      { text: 'The domestic Charminar', hit: false },
    ]);
  });

  it('lets hyphens stand in for spaces', () => {
    const parts = splitHighlights('Indo-Islamic style', ['indo islamic']);
    expect(parts[0]).toEqual({ text: 'Indo-Islamic', hit: true });
  });

  it('handles no text and no terms', () => {
    expect(splitHighlights('', ['x'])).toEqual([]);
    expect(splitHighlights('plain', [])).toEqual([{ text: 'plain', hit: false }]);
  });
});

describe('nextTopicWithWork', () => {
  const topics = [
    { slug: 'a', suggestion_count: 3 },
    { slug: 'b', suggestion_count: 0 },
    { slug: 'c', suggestion_count: 5 },
  ];
  it('finds the next topic with suggestions, wrapping round', () => {
    expect(nextTopicWithWork(topics, 'a')?.slug).toBe('c');
    expect(nextTopicWithWork(topics, 'c')?.slug).toBe('a');
  });
  it('returns null when nothing else has work', () => {
    expect(nextTopicWithWork([{ slug: 'a', suggestion_count: 2 }], 'a')).toBeNull();
    expect(nextTopicWithWork([], null)).toBeNull();
  });
});

describe('small readers', () => {
  it('percentOf never divides by zero', () => {
    expect(percentOf(2279, 4704)).toBe(48);
    expect(percentOf(0, 0)).toBe(0);
  });

  it('readOptions fills missing ids with letters', () => {
    expect(readOptions([{ id: 'a', text: 'One' }, { text: 'Two' }, 'Three', null])).toEqual([
      { id: 'a', text: 'One' },
      { id: 'b', text: 'Two' },
      { id: 'c', text: 'Three' },
    ]);
    expect(readOptions(null)).toEqual([]);
  });

  it('isCorrectOption reads single and multiple answers in any case', () => {
    expect(isCorrectOption('a', 'a')).toBe(true);
    expect(isCorrectOption('b', 'A')).toBe(false);
    expect(isCorrectOption('C', 'a, c')).toBe(true);
    expect(isCorrectOption('a', null)).toBe(false);
  });
});
