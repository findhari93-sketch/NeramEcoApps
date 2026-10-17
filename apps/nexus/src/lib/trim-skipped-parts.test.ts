import { describe, it, expect } from 'vitest';
import { buildCutMap } from './trim-map';
import { skippedParts } from './trim-skipped-parts';

describe('skippedParts', () => {
  it('lists pauses of 10s or more at their place on the trimmed timeline', () => {
    // Lead 0 to 716, a 38s pause at 726 to 764, a 4s breath at 900 to 904, a tail.
    const map = buildCutMap([[716, 726], [764, 900], [904, 3900]]);
    expect(skippedParts(map)).toEqual([{ at: 10, from: 726, to: 764 }]);
  });

  it('offers neither the wait before class nor the tail', () => {
    expect(skippedParts(buildCutMap([[714, 3945]]))).toEqual([]);
  });

  it('takes a lower floor when asked, and survives junk', () => {
    const map = buildCutMap([[0, 100], [104, 200]]);
    expect(skippedParts(map, 3)).toEqual([{ at: 100, from: 100, to: 104 }]);
    expect(skippedParts(null)).toEqual([]);
    expect(skippedParts([] as any)).toEqual([]);
  });
});
