import { describe, expect, it } from 'vitest';
import { countVideoLinks, matchVideoLinks, type VideoMatchRow } from './video-link-matcher';
import { JEE_2015_SOLUTION_VIDEO_LINKS } from '../../../../tests/fixtures/qb-solution-video-links';

/**
 * Which pasted link belongs to which question.
 *
 * The dialog this replaces sent line N to the Nth question in sorted order, so
 * on a paper with gaps or unnumbered questions "line 31" was not Q31. The
 * matcher reads the question number written next to each link instead, and
 * only falls back to line order when the paste carries no numbers at all, and
 * then by question NUMBER, never by position.
 */

const watch = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** An 80-question paper numbered 1 to 80, like JEE Paper 2 2015. */
const paper = (overrides: Partial<Record<number, Partial<VideoMatchRow>>> = {}): VideoMatchRow[] =>
  Array.from({ length: 80 }, (_, i) => ({
    id: `q${i + 1}`,
    number: i + 1,
    savedUrl: null,
    splitDrawing: false,
    ...overrides[i + 1],
  }));

describe('the teacher list as it was pasted', () => {
  const result = matchVideoLinks(JEE_2015_SOLUTION_VIDEO_LINKS, paper());

  it('matches every link to the question named beside it', () => {
    expect(result.mode).toBe('labelled');
    expect(result.linkCount).toBe(59);
    expect(result.matches).toHaveLength(59);
    expect(result.unmatched).toEqual([]);
  });

  it('puts Q31 on question 31, not on the 31st line', () => {
    const q31 = result.matches.find((m) => m.number === 31);
    expect(q31).toMatchObject({ questionId: 'q31', url: watch('U1X9MmLh-ZQ') });
  });

  it('skips the numbers the list leaves out', () => {
    const numbers = result.matches.map((m) => m.number);
    expect(numbers.slice(0, 9)).toEqual([2, 4, 5, 8, 24, 25, 26, 27, 30]);
    expect(numbers).not.toContain(1);
    expect(numbers).not.toContain(3);
  });

  it('reads the Shorts link and the one with a trailing space', () => {
    expect(result.matches.find((m) => m.number === 30)?.url).toBe(watch('T9CB0HymAJo'));
    expect(result.matches.find((m) => m.number === 66)?.url).toBe(watch('acZ5qffBKX0'));
  });

  it('never reads the year in "JEE 2015" as a question number', () => {
    expect(result.matches.every((m) => m.number <= 80)).toBe(true);
  });
});

describe('label shapes', () => {
  it.each([
    ['Q31 https://youtu.be/U1X9MmLh-ZQ'],
    ['Q.31 https://youtu.be/U1X9MmLh-ZQ'],
    ['Q no. 31: https://youtu.be/U1X9MmLh-ZQ'],
    ['Question 31 - https://youtu.be/U1X9MmLh-ZQ'],
    ['Q#31 https://youtu.be/U1X9MmLh-ZQ'],
    ['31. https://youtu.be/U1X9MmLh-ZQ'],
    ['31) https://youtu.be/U1X9MmLh-ZQ'],
    ['31 https://youtu.be/U1X9MmLh-ZQ'],
    ['31 - Aptitude\nhttps://youtu.be/U1X9MmLh-ZQ'],
    ['q no 31\n\nyoutu.be/U1X9MmLh-ZQ'],
  ])('reads %j as Q31', (text) => {
    const result = matchVideoLinks(text, paper());
    expect(result.matches).toEqual([
      expect.objectContaining({ questionId: 'q31', number: 31, url: watch('U1X9MmLh-ZQ') }),
    ]);
  });
});

describe('a paste with no question numbers', () => {
  it('matches line N to question number N, blank lines skipping', () => {
    const text = ['https://youtu.be/xrKukhHIt0A', '', 'https://youtu.be/J9rHcdRPslM'].join('\n');
    const result = matchVideoLinks(text, paper());
    expect(result.mode).toBe('ordered');
    expect(result.matches.map((m) => [m.number, m.questionId])).toEqual([
      [1, 'q1'],
      [3, 'q3'],
    ]);
  });

  it('starts from the question it was pasted into, like a spreadsheet column', () => {
    const text = ['https://youtu.be/xrKukhHIt0A', '', 'https://youtu.be/J9rHcdRPslM'].join('\n');
    const result = matchVideoLinks(text, paper(), { startAt: 31 });
    expect(result.matches.map((m) => m.number)).toEqual([31, 33]);
  });

  it('ignores the start point when the paste names its own questions', () => {
    const result = matchVideoLinks('Q4 https://youtu.be/xrKukhHIt0A', paper(), { startAt: 31 });
    expect(result.matches.map((m) => m.number)).toEqual([4]);
  });

  it('goes by the number a question shows, not by its position in the list', () => {
    // A paper whose first question is numbered 21: line 1 is Q1, which is not
    // on this paper, so it is reported rather than landing on Q21.
    const rows: VideoMatchRow[] = [
      { id: 'q21', number: 21 },
      { id: 'q22', number: 22 },
    ];
    const result = matchVideoLinks('https://youtu.be/xrKukhHIt0A', rows);
    expect(result.matches).toEqual([]);
    expect(result.unmatched).toEqual([
      expect.objectContaining({ line: 1, reason: 'Q1 is not on this paper' }),
    ]);
  });
});

describe('what is reported instead of guessed', () => {
  it('reports an unnumbered link in a numbered list rather than placing it', () => {
    const text = ['Q no 2', 'https://youtu.be/xrKukhHIt0A', 'https://youtu.be/J9rHcdRPslM'].join('\n');
    const result = matchVideoLinks(text, paper());
    expect(result.matches.map((m) => m.number)).toEqual([2]);
    expect(result.unmatched).toEqual([
      expect.objectContaining({ line: 3, reason: 'No question number next to this link' }),
    ]);
  });

  it('reports a number that is not on the paper', () => {
    const result = matchVideoLinks('Q99 https://youtu.be/xrKukhHIt0A', paper());
    expect(result.unmatched).toEqual([expect.objectContaining({ line: 1, reason: 'Q99 is not on this paper' })]);
  });

  it('reports a link that is not a video we can play', () => {
    const result = matchVideoLinks('Q5 https://vimeo.com/12345', paper());
    expect(result.unmatched).toEqual([
      expect.objectContaining({ line: 1, reason: 'Not a YouTube or SharePoint link' }),
    ]);
  });

  it('sends a split drawing to its parts instead of writing one video over them', () => {
    const result = matchVideoLinks('Q78 https://youtu.be/xrKukhHIt0A', paper({ 78: { splitDrawing: true } }));
    expect(result.matches).toEqual([]);
    expect(result.unmatched).toEqual([
      expect.objectContaining({ reason: 'Q78 has parts: set its videos per part' }),
    ]);
  });

  it('keeps the later link when a number repeats, and says so', () => {
    const text = ['Q4 https://youtu.be/xrKukhHIt0A', 'Q4 https://youtu.be/J9rHcdRPslM'].join('\n');
    const result = matchVideoLinks(text, paper());
    expect(result.matches).toEqual([expect.objectContaining({ number: 4, url: watch('J9rHcdRPslM'), line: 2 })]);
    expect(result.duplicates).toEqual([{ number: 4, lines: [1, 2] }]);
  });

  it('marks a link that is already saved on that question as unchanged', () => {
    const result = matchVideoLinks(
      'Q2 https://youtu.be/xrKukhHIt0A?si=abc',
      paper({ 2: { savedUrl: watch('xrKukhHIt0A') } }),
    );
    expect(result.matches[0].unchanged).toBe(true);
  });
});

describe('nothing to match', () => {
  it('finds no links in text with none', () => {
    const result = matchVideoLinks('just some notes\nQ no 4', paper());
    expect(result).toMatchObject({ mode: 'none', linkCount: 0, matches: [], unmatched: [] });
  });
});

describe('countVideoLinks', () => {
  it('counts the links in a paste, so one link can stay a one-field paste', () => {
    expect(countVideoLinks('https://youtu.be/xrKukhHIt0A')).toBe(1);
    expect(countVideoLinks(JEE_2015_SOLUTION_VIDEO_LINKS)).toBe(59);
    expect(countVideoLinks('no links here')).toBe(0);
  });
});
