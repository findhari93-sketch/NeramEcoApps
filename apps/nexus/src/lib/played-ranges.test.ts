import { describe, it, expect } from 'vitest';
import { addPlayed, coveredWithin, firstGapWithin, mergeRanges } from './played-ranges';

describe('mergeRanges', () => {
  it('sorts, joins touching stretches and drops nonsense', () => {
    expect(
      mergeRanges([
        [50, 60],
        [0, 10],
        [10.5, 20],
        [30, 25],
        [Number.NaN, 5],
      ]),
    ).toEqual([
      [0, 20],
      [50, 60],
    ]);
  });

  it('never mutates what it was given', () => {
    const input: Array<[number, number]> = [[5, 6], [0, 1]];
    mergeRanges(input);
    expect(input).toEqual([[5, 6], [0, 1]]);
  });
});

describe('addPlayed', () => {
  it('grows a stretch tick by tick', () => {
    let r = addPlayed([], 0, 0.25);
    r = addPlayed(r, 0.25, 0.5);
    expect(r).toEqual([[0, 0.5]]);
  });

  it('ignores a backwards or empty step', () => {
    expect(addPlayed([[0, 5]], 5, 3)).toEqual([[0, 5]]);
  });
});

describe('coveredWithin', () => {
  it('counts only what falls inside the window', () => {
    expect(coveredWithin([[0, 100], [200, 300]], 50, 250)).toBe(100);
  });

  it('is zero for an empty window', () => {
    expect(coveredWithin([[0, 100]], 50, 50)).toBe(0);
  });
});

describe('firstGapWithin', () => {
  it('names where the first unwatched stretch starts', () => {
    expect(firstGapWithin([[0, 100], [200, 300]], 0, 300)).toBe(100);
    expect(firstGapWithin([[50, 300]], 0, 300)).toBe(0);
  });

  it('ignores holes too short to be worth going back for', () => {
    expect(firstGapWithin([[0, 100], [101, 300]], 0, 300)).toBeNull();
    expect(firstGapWithin([[0, 298.5]], 0, 300)).toBeNull();
  });

  it('finds a missing tail', () => {
    expect(firstGapWithin([[0, 100]], 0, 300)).toBe(100);
  });
});
