import { describe, it, expect } from 'vitest';
import { briefReadiness, parseBandDescriptions } from './drawing-brief-readiness';

const full = { '1': 'Walls lean and sizes wander', '2': 'b', '3': 'c', '4': 'd', '5': 'e' };
const criterion = (over: Record<string, unknown> = {}) => ({ key: 'proportion', title: 'Proportion', band_descriptions: full, ...over });

describe('briefReadiness', () => {
  it('is ready with every band written and five anchors', () => {
    const r = briefReadiness([criterion(), criterion({ key: 'composition', title: 'Composition' })], [1, 2, 3, 4, 5]);
    expect(r).toMatchObject({ ready: true, bandsWritten: 10, bandsTotal: 10, anchorsSet: 5, blockers: [] });
  });

  it('refuses while any band description is a placeholder', () => {
    const r = briefReadiness([criterion({ band_descriptions: { ...full, '3': 'TODO' } })], [1, 2, 3, 4, 5]);
    expect(r.ready).toBe(false);
    expect(r.bandsWritten).toBe(4);
    expect(r.blockers).toEqual(['Proportion: band 3 still needs wording.']);
  });

  it('refuses a brief with no wording at all, and says so plainly', () => {
    const r = briefReadiness([criterion({ band_descriptions: {} })], [1, 2, 3, 4, 5]);
    expect(r.blockers).toEqual(['Proportion: no bands written yet.']);
  });

  it('refuses with fewer than five anchors', () => {
    const r = briefReadiness([criterion()], [1, 2, 4]);
    expect(r.ready).toBe(false);
    expect(r.missingAnchorBands).toEqual([3, 5]);
    expect(r.blockers).toEqual(['Reference sheets are set for 3 of 5 bands. Band 3, 5 still need one.']);
  });

  it('does not count a duplicate or out-of-range anchor as a band', () => {
    expect(briefReadiness([criterion()], [1, 1, 2, 3, 4, 9]).anchorsSet).toBe(4);
  });

  it('refuses a brief with no criteria', () => {
    expect(briefReadiness([], [1, 2, 3, 4, 5]).ready).toBe(false);
  });
});

describe('parseBandDescriptions', () => {
  it('keeps bands 1 to 5, trimmed, and drops empties', () => {
    expect(parseBandDescriptions({ '1': '  Walls   lean ', '2': '', '3': null })).toEqual({ '1': 'Walls lean' });
  });

  it('refuses unknown bands, non-strings and runaway text', () => {
    expect(parseBandDescriptions({ '6': 'x' })).toBeNull();
    expect(parseBandDescriptions({ '1': 5 })).toBeNull();
    expect(parseBandDescriptions({ '1': 'x'.repeat(601) })).toBeNull();
    expect(parseBandDescriptions([])).toBeNull();
  });
});
