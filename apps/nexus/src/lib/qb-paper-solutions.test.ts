import { describe, expect, it } from 'vitest';
import { tallyDrawingSolutions, tallySolutions } from './qb-paper-solutions';
import { MAX_BULK_PUBLISH_IDS, parsePaperIds } from './qb-bulk-publish';

describe('tallySolutions', () => {
  it('counts solvable and solved questions per paper', () => {
    const counts = tallySolutions(
      ['a', 'b', 'c'],
      ['a', 'a', 'a', 'b'],
      ['a', 'a'],
    );
    expect(counts.get('a')).toEqual({ solvable: 3, solved: 2 });
    expect(counts.get('b')).toEqual({ solvable: 1, solved: 0 });
    // A paper the non-drawing half found nothing in still gets an entry.
    expect(counts.get('c')).toEqual({ solvable: 0, solved: 0 });
  });

  it('ignores rows for papers it was not asked about', () => {
    const counts = tallySolutions(['a'], ['a', 'zzz'], ['zzz']);
    expect(counts.size).toBe(1);
    expect(counts.get('a')).toEqual({ solvable: 1, solved: 0 });
  });
});

describe('parsePaperIds', () => {
  it('treats a missing list as "every ready paper"', () => {
    expect(parsePaperIds(null)).toBeNull();
    expect(parsePaperIds({})).toBeNull();
  });

  it('accepts a list of ids and drops duplicates', () => {
    expect(parsePaperIds({ paper_ids: ['a', 'b', 'a'] })).toEqual(['a', 'b']);
  });

  it('refuses an empty, oversized or malformed list rather than publishing everything', () => {
    expect(parsePaperIds({ paper_ids: [] })).toBe('invalid');
    expect(parsePaperIds({ paper_ids: 'a' })).toBe('invalid');
    expect(parsePaperIds({ paper_ids: ['a', 3] })).toBe('invalid');
    expect(parsePaperIds({ paper_ids: [''] })).toBe('invalid');
    expect(
      parsePaperIds({ paper_ids: Array.from({ length: MAX_BULK_PUBLISH_IDS + 1 }, (_, i) => `p${i}`) }),
    ).toBe('invalid');
  });
});

describe('tallyDrawingSolutions', () => {
  const parts = (...urls: (string | null)[]) => ({
    mode: 'any_one',
    items: urls.map((url, i) => ({
      id: 'abcd'[i],
      label: 'ABCD'[i],
      text: `Option ${'ABCD'[i]}`,
      solution_image_url: url,
    })),
  });

  it('counts a split question solved only when every part has its own image', () => {
    const counts = tallyDrawingSolutions([
      { original_paper_id: 'p', drawing_parts: parts('https://x/a.png', null), solution_image_url: 'https://x/a.png' },
      { original_paper_id: 'p', drawing_parts: parts('https://x/a.png', 'https://x/b.png'), solution_image_url: 'https://x/a.png' },
    ]);
    // The first one's question column is set, from part A. Counting on that
    // column alone is what made a half-answered question read as solved.
    expect(counts.get('p')).toEqual({ solvable: 2, solved: 1 });
  });

  it('falls back to the question column for a drawing that was never split', () => {
    const counts = tallyDrawingSolutions([
      { original_paper_id: 'p', drawing_parts: null, solution_image_url: 'https://x/s.png' },
      { original_paper_id: 'p', drawing_parts: null, solution_image_url: null },
    ]);
    expect(counts.get('p')).toEqual({ solvable: 2, solved: 1 });
  });

  it('does not accept a video in place of the image', () => {
    // Words and video do not teach a drawing, so the rule is stricter here
    // than for a maths question, and matches the paper page's chip.
    const counts = tallyDrawingSolutions([
      { original_paper_id: 'p', drawing_parts: null, solution_image_url: null },
    ]);
    expect(counts.get('p')).toEqual({ solvable: 1, solved: 0 });
  });

  it('skips a row with no paper', () => {
    expect(tallyDrawingSolutions([
      { original_paper_id: null, drawing_parts: null, solution_image_url: null },
    ]).size).toBe(0);
  });
});
