import { describe, it, expect } from 'vitest';
import { applyNIRFFilters, nirfHeroStats, toPublicNIRFRow } from './nirf-client-filter';
import { DEFAULT_FILTERS, type NIRFFilters } from './nirf-filters';

type Row = Parameters<typeof applyNIRFFilters>[0][number];

function row(over: Partial<Row> & { id: string; year: number; rank: number }): Row {
  return {
    college_id: over.id.split('-')[0],
    score: null,
    source_name: 'Source',
    source_city: null,
    source_state: null,
    tlr: null,
    rpc: null,
    go: null,
    oi: null,
    pr: null,
    college: { id: 'c', slug: 's', name: 'College', short_name: null, city: 'Chennai', state: 'Tamil Nadu', state_slug: 'tamil-nadu', type: 'government', logo_url: null, neram_tier: 'free', naac_grade: null },
    ...over,
  } as Row;
}

const rows: Row[] = [
  row({ id: 'iitr-2025', year: 2025, rank: 1, score: 80, source_name: 'IIT Roorkee', college: { ...row({ id: 'x', year: 1, rank: 1 }).college!, name: 'IIT Roorkee', city: 'Roorkee', state: 'Uttarakhand', state_slug: 'uttarakhand', type: 'government' } }),
  row({ id: 'nitc-2025', year: 2025, rank: 2, score: 75, source_name: 'NIT Calicut', college: { ...row({ id: 'x', year: 1, rank: 1 }).college!, name: 'NIT Calicut', city: 'Calicut', state: 'Kerala', state_slug: 'kerala', type: 'government' } }),
  row({ id: 'priv-2025', year: 2025, rank: 3, score: null, source_name: 'Private School', college: { ...row({ id: 'x', year: 1, rank: 1 }).college!, name: 'Private School', type: 'private' } }),
  row({ id: 'iitr-2024', year: 2024, rank: 2, score: 78, source_name: 'IIT Roorkee', college: { ...row({ id: 'x', year: 1, rank: 1 }).college!, name: 'IIT Roorkee', city: 'Roorkee', state: 'Uttarakhand', state_slug: 'uttarakhand', type: 'government' } }),
  row({ id: 'nitc-2024', year: 2024, rank: 1, score: 79, source_name: 'NIT Calicut', college: { ...row({ id: 'x', year: 1, rank: 1 }).college!, name: 'NIT Calicut', city: 'Calicut', state: 'Kerala', state_slug: 'kerala', type: 'government' } }),
];

const f = (over: Partial<NIRFFilters>): NIRFFilters => ({ ...DEFAULT_FILTERS, ...over });
const ids = (xs: Row[]) => xs.map((x) => x.id);

describe('applyNIRFFilters (same results the server query gave)', () => {
  it('defaults to the latest year, best rank first', () => {
    expect(ids(applyNIRFFilters(rows, f({}), 2025).data)).toEqual(['iitr-2025', 'nitc-2025', 'priv-2025']);
  });

  it('uses the selected years, newest year first then rank', () => {
    expect(ids(applyNIRFFilters(rows, f({ years: [2024, 2025] }), 2025).data)).toEqual([
      'iitr-2025',
      'nitc-2025',
      'priv-2025',
      'nitc-2024',
      'iitr-2024',
    ]);
  });

  it('compare mode spans every year', () => {
    expect(applyNIRFFilters(rows, f({ compare: true, years: [2024] }), 2025).data).toHaveLength(5);
  });

  it('filters rank and score ranges, dropping unknown scores', () => {
    expect(ids(applyNIRFFilters(rows, f({ rankMax: 2 }), 2025).data)).toEqual(['iitr-2025', 'nitc-2025']);
    expect(ids(applyNIRFFilters(rows, f({ scoreMin: 76 }), 2025).data)).toEqual(['iitr-2025']);
  });

  it('filters by state slug or name, city and type, case-insensitively', () => {
    expect(ids(applyNIRFFilters(rows, f({ state: 'kerala' }), 2025).data)).toEqual(['nitc-2025']);
    expect(ids(applyNIRFFilters(rows, f({ state: 'Kerala' }), 2025).data)).toEqual(['nitc-2025']);
    expect(ids(applyNIRFFilters(rows, f({ city: 'roorkee' }), 2025).data)).toEqual(['iitr-2025']);
    expect(ids(applyNIRFFilters(rows, f({ type: 'private' }), 2025).data)).toEqual(['priv-2025']);
  });

  it('searches names and places', () => {
    expect(ids(applyNIRFFilters(rows, f({ search: 'calicut' }), 2025).data)).toEqual(['nitc-2025']);
  });

  it('sorts by score (unknown last) and by name', () => {
    expect(ids(applyNIRFFilters(rows, f({ sort: 'score_desc' }), 2025).data)).toEqual(['iitr-2025', 'nitc-2025', 'priv-2025']);
    expect(ids(applyNIRFFilters(rows, f({ sort: 'name_asc' }), 2025).data)).toEqual(['iitr-2025', 'nitc-2025', 'priv-2025']);
  });

  it('reports the matching count', () => {
    expect(applyNIRFFilters(rows, f({ state: 'kerala' }), 2025).count).toBe(1);
  });
});

describe('nirfHeroStats', () => {
  it('counts institutions, states, the top score and government vs private for a year', () => {
    expect(nirfHeroStats(rows, 2025)).toEqual({ institutionsRanked: 3, topScore: 80, statesCovered: 3, govt: 2, privateCount: 1 });
  });
});

describe('toPublicNIRFRow', () => {
  it('drops admin-only fields', () => {
    const t = toPublicNIRFRow({ ...rows[0], notes: 'x', match_status: 'matched', source_url: 'u', created_at: 'c', updated_at: 'u' } as never) as Record<string, unknown>;
    for (const k of ['notes', 'match_status', 'match_score', 'source_url', 'created_at', 'updated_at']) expect(t).not.toHaveProperty(k);
    expect(t.id).toBe('iitr-2025');
  });
});
