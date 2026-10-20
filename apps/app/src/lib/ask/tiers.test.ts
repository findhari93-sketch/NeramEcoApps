import { describe, it, expect } from 'vitest';
import { groupJosaa, groupKeam, groupTnea, limitGroups, tierForMark, tierForRank } from './tiers';
import type { CutoffCollege, JosaaClosing } from '@/lib/tools/data/facts';

const tnea = (name: string, closingMarks: Record<string, number>): CutoffCollege => ({
  system: 'TNEA_BARCH',
  code: name,
  name,
  city: 'Chennai',
  district: null,
  citySlug: null,
  stateSlug: 'tamil-nadu',
  year: 2025,
  closingMarks,
});

describe('mark tiers (TNEA)', () => {
  it('bands by margin over the bar', () => {
    expect(tierForMark(250, 240)).toBe('safe');
    expect(tierForMark(245, 240)).toBe('safe');
    expect(tierForMark(242, 240)).toBe('target');
    expect(tierForMark(240, 240)).toBe('target');
    expect(tierForMark(235, 240)).toBe('reach');
    expect(tierForMark(230, 240)).toBe('reach');
    expect(tierForMark(229, 240)).toBeNull();
  });

  it('uses the lower of OC and the student community as the bar', () => {
    const colleges = [tnea('A', { OC: 280, BC: 250 }), tnea('B', { OC: 240 }), tnea('C', { OC: 300, BC: 299 })];
    const g = groupTnea(colleges, 252, 'BC');
    expect(g.safe.map((r) => [r.name, r.category, r.closing])).toEqual([['B', 'OC', 240]]);
    expect(g.target.map((r) => [r.name, r.category, r.closing])).toEqual([['A', 'BC', 250]]);
    expect(g.reach).toEqual([]);
  });

  it('an OC student only competes for OC seats', () => {
    const g = groupTnea([tnea('A', { OC: 280, BC: 250 })], 252, 'OC');
    expect(g.safe.length + g.target.length + g.reach.length).toBe(0);
  });
});

describe('rank tiers (KEAM, JoSAA)', () => {
  it('bands by how far after the student the closing rank fell', () => {
    expect(tierForRank(1000, 1200)).toBe('safe');
    expect(tierForRank(1000, 1100)).toBe('target');
    expect(tierForRank(1000, 1000)).toBe('target');
    expect(tierForRank(1000, 900)).toBe('reach');
    expect(tierForRank(1000, 800)).toBeNull();
  });

  it('groups KEAM colleges best first', () => {
    const k = (name: string, closingRank: number): CutoffCollege => ({ ...tnea(name, {}), system: 'KEAM_BARCH', closingMarks: undefined, closingRank, stateSlug: 'kerala' });
    const g = groupKeam([k('X', 1500), k('Y', 1300), k('Z', 950)], 1000);
    expect(g.safe.map((r) => r.name)).toEqual(['Y', 'X']);
    expect(g.reach.map((r) => r.name)).toEqual(['Z']);
  });

  it('keeps one JoSAA row per institute, the most generous quota', () => {
    const row = (institute: string, quota: string, closingRank: number): JosaaClosing => ({ institute, type: 'NIT', state: null, city: null, quota, closingRank, year: 2025, round: 6 });
    const g = groupJosaa([row('NIT T', 'OS', 900), row('NIT T', 'HS', 2000), row('NIT T', 'AI', 1100)], 1000);
    expect(g.target).toEqual([expect.objectContaining({ name: 'NIT T', closing: 1100, category: 'AI' })]);
  });
});

describe('what a guest sees', () => {
  const groups = {
    safe: [{ name: 'a', city: null, closing: 1 }, { name: 'b', city: null, closing: 1 }],
    target: [{ name: 'c', city: null, closing: 1 }],
    reach: [],
  };
  it('one per tier for a guest, with the rest counted as hidden', () => {
    expect(limitGroups(groups, true)).toMatchObject({ counts: { safe: 2, target: 1, reach: 0 }, hidden: 1 });
    expect(limitGroups(groups, true).groups.safe).toHaveLength(1);
  });
  it('everything (up to the cap) for a signed-in student', () => {
    expect(limitGroups(groups, false)).toMatchObject({ hidden: 0 });
    expect(limitGroups(groups, false).groups.safe).toHaveLength(2);
  });
});
