import { describe, it, expect } from 'vitest';
import { currentShapeRegions } from './drawing-region-sync';

describe('currentShapeRegions', () => {
  const box = { id: 'r1', x: 0.1, y: 0.2, width: 0.3, height: 0.25, comment: 'Shadow direction' };

  it('keeps boxes in the current shape', () => {
    expect(currentShapeRegions([box])).toEqual([box]);
  });

  it('reads null as "the teacher cleared every box"', () => {
    expect(currentShapeRegions(null)).toEqual([]);
  });

  it('reads an empty list the same way', () => {
    expect(currentShapeRegions([])).toEqual([]);
  });

  it('ignores the dead legacy shape entirely rather than wiping anything', () => {
    // Prod still has three rows of {area,label,severity}. Treating them as
    // "no boxes" would delete real marks; they are simply not a statement.
    expect(currentShapeRegions([{ area: 'top', label: 'x', severity: 'high' }])).toBeNull();
  });

  it('keeps the valid boxes out of a mixed list', () => {
    expect(currentShapeRegions([box, { area: 'top' }])).toEqual([box]);
  });

  it('says nothing when the field was not sent at all', () => {
    expect(currentShapeRegions(undefined)).toBeNull();
    expect(currentShapeRegions('nonsense')).toBeNull();
  });

  it('refuses a box with a number missing', () => {
    expect(currentShapeRegions([{ ...box, height: undefined }, box])).toEqual([box]);
  });
});
