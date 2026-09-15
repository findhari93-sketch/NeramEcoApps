import { describe, expect, it } from 'vitest';
import { columnsForWidth, layoutMasonry } from './masonry-layout';

describe('columnsForWidth', () => {
  it('gives phones two columns and wide screens five', () => {
    expect(columnsForWidth(343)).toBe(2);
    expect(columnsForWidth(600)).toBe(3);
    expect(columnsForWidth(900)).toBe(4);
    expect(columnsForWidth(1300)).toBe(5);
  });
});

describe('layoutMasonry', () => {
  const aspect = (x: { a: number | null }) => x.a;

  it('drops each item into the shortest column', () => {
    const items = [{ a: 1 }, { a: 0.5 }, { a: 1 }, { a: 1 }];
    const cols = layoutMasonry(items, 2, aspect);
    expect(cols.map((c) => c.map((x) => items.indexOf(x)))).toEqual([[0, 2], [1, 3]]);
  });

  it('keeps earlier placements when a page is appended', () => {
    const first = Array.from({ length: 10 }, (_, i) => ({ a: [0.7, 1, 1.4][i % 3] }));
    const more = [...first, { a: 0.6 }, { a: 1.2 }];
    const before = layoutMasonry(first, 3, aspect);
    const after = layoutMasonry(more, 3, aspect);
    before.forEach((col, i) => expect(after[i].slice(0, col.length)).toEqual(col));
  });

  it('treats a missing shape as a 3 by 4 portrait and never returns zero columns', () => {
    expect(layoutMasonry([{ a: null }], 0, aspect)).toEqual([[{ a: null }]]);
  });
});
