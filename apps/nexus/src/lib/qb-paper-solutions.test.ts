import { describe, expect, it } from 'vitest';
import { tallySolutions } from './qb-paper-solutions';
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
    // A paper of drawings has nothing solvable, and still gets an entry.
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
