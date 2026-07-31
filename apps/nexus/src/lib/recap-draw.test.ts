import { describe, it, expect } from 'vitest';
import {
  pickDraw,
  permuteOptions,
  buildOptionMaps,
  displayedToOriginal,
  originalToDisplayed,
  applyOptionMap,
  drawSeed,
} from './recap-draw';

const POOL_15 = Array.from({ length: 15 }, (_, i) => `q${i + 1}`);
const SEED = drawSeed('stu-1', 'sec-1');

describe('pickDraw serves a rotating window of the pool', () => {
  it('serves exactly the requested count', () => {
    expect(pickDraw(POOL_15, 10, 1, SEED)).toHaveLength(10);
  });

  it('serves distinct questions within one attempt', () => {
    const draw = pickDraw(POOL_15, 10, 1, SEED);
    expect(new Set(draw).size).toBe(10);
  });

  it('overlaps the previous attempt by at most the pool remainder', () => {
    const a1 = pickDraw(POOL_15, 10, 1, SEED);
    const a2 = pickDraw(POOL_15, 10, 2, SEED);
    const shared = a1.filter((id) => a2.includes(id));
    // 15 pool, 10 served: the window advances by 10 and wraps, so 5 repeat.
    expect(shared.length).toBeLessThanOrEqual(5);
    // And it genuinely brings in new material rather than reshuffling the same set.
    expect(a2.some((id) => !a1.includes(id))).toBe(true);
  });

  it('is deterministic, so a reload mid-quiz serves the same paper', () => {
    expect(pickDraw(POOL_15, 10, 3, SEED)).toEqual(pickDraw(POOL_15, 10, 3, SEED));
  });

  it('gives different students different papers', () => {
    const a = pickDraw(POOL_15, 10, 1, drawSeed('stu-1', 'sec-1'));
    const b = pickDraw(POOL_15, 10, 1, drawSeed('stu-2', 'sec-1'));
    expect(a).not.toEqual(b);
  });

  it('degrades to a reshuffle when the pool is no bigger than the serve count', () => {
    // Existing recaps have 2 to 4 questions per checkpoint, not 15.
    const small = ['q1', 'q2', 'q3'];
    const a1 = pickDraw(small, 10, 1, SEED);
    const a2 = pickDraw(small, 10, 2, SEED);
    // Copy before sorting: Array.prototype.sort mutates, and a1 is compared
    // against a fresh call below.
    expect([...a1].sort()).toEqual(small);
    expect([...a2].sort()).toEqual(small);
    expect(pickDraw(small, 10, 1, SEED)).toEqual(a1);
  });

  it('handles an empty pool without throwing', () => {
    expect(pickDraw([], 10, 1, SEED)).toEqual([]);
  });

  it('never returns more than the pool holds', () => {
    expect(pickDraw(['q1', 'q2'], 10, 1, SEED)).toHaveLength(2);
  });

  it('keeps working at high attempt numbers', () => {
    const draw = pickDraw(POOL_15, 10, 47, SEED);
    expect(draw).toHaveLength(10);
    expect(new Set(draw).size).toBe(10);
  });
});

describe('option permutation', () => {
  it('is a bijection over a, b, c and d', () => {
    const map = permuteOptions('q1', 1, SEED);
    expect([...map].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('differs between attempts, so a remembered position is worthless', () => {
    const maps = [1, 2, 3, 4].map((n) => permuteOptions('q1', n, SEED).join(''));
    expect(new Set(maps).size).toBeGreaterThan(1);
  });

  it('is deterministic per question and attempt', () => {
    expect(permuteOptions('q1', 2, SEED)).toEqual(permuteOptions('q1', 2, SEED));
  });

  it('builds a map for every served question', () => {
    const ids = pickDraw(POOL_15, 10, 1, SEED);
    const maps = buildOptionMaps(ids, 1, SEED);
    expect(Object.keys(maps).sort()).toEqual([...ids].sort());
  });
});

describe('translating between displayed and original lettering', () => {
  const question = { option_a: 'ALPHA', option_b: 'BRAVO', option_c: 'CHARLIE', option_d: 'DELTA' };

  it('round trips: the displayed letter for the correct answer grades correct', () => {
    for (const attempt of [1, 2, 3, 7]) {
      const map = permuteOptions('q1', attempt, SEED);
      for (const original of ['a', 'b', 'c', 'd'] as const) {
        const displayed = originalToDisplayed(original, map);
        expect(displayed).not.toBeNull();
        expect(displayedToOriginal(displayed, map)).toBe(original);
      }
    }
  });

  it('shows the option text under its new letter', () => {
    const map = permuteOptions('q1', 1, SEED);
    const shown = applyOptionMap(question, map);
    const source: Record<string, string> = {
      a: 'ALPHA',
      b: 'BRAVO',
      c: 'CHARLIE',
      d: 'DELTA',
    };
    expect(shown.option_a).toBe(source[map[0]]);
    expect(shown.option_d).toBe(source[map[3]]);
    // Same four options, just relettered. Nothing invented, nothing dropped.
    expect([shown.option_a, shown.option_b, shown.option_c, shown.option_d].sort()).toEqual(
      ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'].sort(),
    );
  });

  it('falls back to identity when no map exists, so legacy attempts still grade', () => {
    expect(displayedToOriginal('c', undefined)).toBe('c');
    expect(originalToDisplayed('c', undefined)).toBe('c');
    expect(applyOptionMap(question, undefined)).toEqual(question);
  });

  it('treats a missing or nonsense answer as unanswered rather than correct', () => {
    const map = permuteOptions('q1', 1, SEED);
    expect(displayedToOriginal(null, map)).toBeNull();
    expect(displayedToOriginal('', map)).toBeNull();
    expect(displayedToOriginal('z', map)).toBeNull();
  });

  it('accepts an uppercase answer', () => {
    const map = permuteOptions('q1', 1, SEED);
    expect(displayedToOriginal('B', map)).toBe(displayedToOriginal('b', map));
  });
});
