import { describe, it, expect } from 'vitest';
import {
  addPlayed,
  coveredWithin,
  firstGapWithin,
  mergeRanges,
  lastPlayedPoint,
  parseRanges,
  compactRanges,
  truncateRanges,
  totalPlayed,
  holesWithin,
  catchUpStretches,
} from './played-ranges';

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

describe('resume and storage helpers', () => {
  it('resumes at the last point really played, not at a drag and not at the first hole', () => {
    const ranges = [[0, 3496], [3600, 3700]] as const;
    expect(lastPlayedPoint(ranges, 3540)).toBe(3496); // dragged on past what was played
    expect(lastPlayedPoint(ranges, 3650)).toBe(3650); // mid stretch
    expect(lastPlayedPoint(ranges, 3800)).toBe(3700); // watched past a hole, then dragged
    expect(lastPlayedPoint([], 300)).toBe(0);
    expect(lastPlayedPoint(ranges, 0)).toBe(0);
  });

  it('parses untrusted JSON into clean, clamped, merged ranges', () => {
    expect(parseRanges([[5, 2], [0, 10.04], ['a', 1], [8, 120], null], 100)).toEqual([[0, 100]]);
    expect(parseRanges('nope')).toEqual([]);
  });

  it('compacts by closing the smallest holes first', () => {
    const ranges: [number, number][] = [[0, 10], [12, 20], [50, 60], [61.5, 70]];
    expect(compactRanges(ranges, 2)).toEqual([[0, 20], [50, 70]]);
    expect(compactRanges(ranges, 10)).toHaveLength(4);
  });

  it('truncates to the earliest seconds and totals coverage', () => {
    expect(truncateRanges([[0, 10], [20, 30]], 15)).toEqual([[0, 10], [20, 25]]);
    expect(totalPlayed([[0, 10], [5, 30]])).toBe(30);
  });
});

describe('the parts a student missed', () => {
  it('lists every hole of a second or more, not just the first', () => {
    const ranges = [[3429, 3500], [3502.5, 3700], [3760, 4000]] as const;
    expect(holesWithin(ranges, 3429, 4366)).toEqual([[3500, 3502.5], [3700, 3760], [4000, 4366]]);
    expect(holesWithin([[0, 100]], 0, 100)).toEqual([]);
    expect(holesWithin([], 10, 20)).toEqual([[10, 20]]);
  });

  it('plays each from a second early and joins those a few seconds apart', () => {
    const holes = [[100, 110], [115, 130], [300, 320]] as const;
    expect(catchUpStretches(holes, 0, 400)).toEqual([[99, 130], [299, 320]]);
    // Clamped to the section.
    expect(catchUpStretches([[0, 5]], 0, 400)).toEqual([[0, 5]]);
  });
});
