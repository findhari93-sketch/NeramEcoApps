import { describe, it, expect } from 'vitest';
import { getCity as getPlace, type GeoCity } from '@neram/geo';

const getCity = (slug: string) => getPlace(slug) as (GeoCity & { kind: 'india' }) | undefined;
import {
  parseCentre,
  nearestCentres,
  examCentreCityGate,
  examCentreCityHasPage,
  tneaMatches,
  keamMatches,
  limitForDemo,
  predictorCityGate,
  coaCityGate,
  rankBands,
  bandForMark,
  type CentreRow,
  type CutoffCollege,
} from './facts';
import { SELECTS } from './selects';

const row = (city: string, state: string, lat: number, lng: number, extra: Partial<CentreRow> = {}): CentreRow => ({
  city_brochure: city,
  state,
  latitude: lat,
  longitude: lng,
  confidence: 'HIGH',
  tcs_ion_confirmed: true,
  probable_center_1: 'Venue A',
  probable_center_2: null,
  is_new_2025: false,
  year: 2025,
  updated_at: null,
  ...extra,
});

describe('exam centre facts', () => {
  const centres = [
    row('Chennai', 'Tamil Nadu', 13.0827, 80.2707),
    row('Coimbatore', 'Tamil Nadu', 11.0168, 76.9558),
    row('Bangalore', 'Karnataka', 12.9716, 77.5946),
    row('Dubai (UAE)', 'International', 25.2, 55.27),
  ].map((r) => parseCentre(r)!);

  it('orders by distance, own city first, never abroad', () => {
    const chennai = getCity('chennai')!;
    const near = nearestCentres(chennai, centres);
    expect(near[0]).toMatchObject({ inThisCity: true, km: 0 });
    expect(near.map((n) => n.centre.label)).not.toContain('Dubai');
  });

  it('indexes a city with a centre in it, and 404s cities far from every centre', () => {
    const chennai = getCity('chennai')!;
    const near = nearestCentres(chennai, centres);
    expect(examCentreCityGate(chennai, near, 1).index).toBe(true);
    expect(examCentreCityHasPage([{ centre: centres[0], km: 320, inThisCity: false }])).toBe(false);
    expect(examCentreCityHasPage([{ centre: centres[0], km: 120, inThisCity: false }])).toBe(true);
  });

  it('never indexes on weak facts only', () => {
    const city = { ...getCity('chennai')!, slug: 'x', tier: 3 as const, isDistrictHQ: true };
    const far = [{ centre: centres[0], km: 140, inThisCity: false }];
    expect(examCentreCityGate(city, far, 1).index).toBe(false);
  });
});

describe('demo maths', () => {
  const tnea: CutoffCollege[] = [
    { system: 'TNEA_BARCH', code: '1', name: 'A', city: null, district: null, citySlug: null, stateSlug: 'tamil-nadu', year: 2025, closingMarks: { OC: 300 } },
    { system: 'TNEA_BARCH', code: '2', name: 'B', city: null, district: null, citySlug: null, stateSlug: 'tamil-nadu', year: 2025, closingMarks: { OC: 250 } },
    { system: 'TNEA_BARCH', code: '3', name: 'C', city: null, district: null, citySlug: null, stateSlug: 'tamil-nadu', year: 2025, closingMarks: { BC: 200 } },
  ];

  it('TNEA: colleges with closing mark at or below yours, strongest first', () => {
    expect(tneaMatches(tnea, 300).map((c) => c.code)).toEqual(['1', '2']);
    expect(tneaMatches(tnea, 260).map((c) => c.code)).toEqual(['2']);
  });

  it('KEAM: colleges whose closing rank is at or after yours', () => {
    const keam = [
      { ...tnea[0], system: 'KEAM_BARCH' as const, closingMarks: undefined, closingRank: 500 },
      { ...tnea[1], system: 'KEAM_BARCH' as const, closingMarks: undefined, closingRank: 2000 },
    ];
    expect(keamMatches(keam, 800).map((c) => c.code)).toEqual(['2']);
  });

  it('shows three and counts the rest', () => {
    expect(limitForDemo([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: 2 });
    expect(limitForDemo([1])).toEqual({ shown: [1], more: 0 });
  });

  it('gates predictor and COA city pages on real colleges', () => {
    expect(predictorCityGate(1, 0, true).index).toBe(true);
    expect(predictorCityGate(0, 0, true).index).toBe(false);
    expect(coaCityGate(2).index).toBe(true);
    expect(coaCityGate(1).index).toBe(false);
  });
});

describe('privacy', () => {
  it('never selects a personal column', () => {
    for (const cols of Object.values(SELECTS)) {
      expect(cols).not.toMatch(/candidate_name|date_of_birth|application_number|phone|email|mobile|head_of_dept/);
    }
  });
});

describe('rank bands', () => {
  const rows = [
    { rank: 1, aggregate_mark: 335 },
    { rank: 2, aggregate_mark: 331 },
    { rank: 3, aggregate_mark: 330.5 },
    { rank: 4, aggregate_mark: 322 },
    { rank: 5, aggregate_mark: 321 },
    { rank: 6, aggregate_mark: 320 },
    { rank: 7, aggregate_mark: 300 },
  ];

  it('groups marks into 10-mark bands with the ranks they got', () => {
    const bands = rankBands(rows);
    expect(bands[0]).toMatchObject({ from: 330, to: 340, bestRank: 1, worstRank: 3, count: 3 });
    expect(bandForMark(bands, 325)).toMatchObject({ bestRank: 4, worstRank: 7 }); // the lone 300 joined this band
  });

  it('never leaves a band of one or two students on its own', () => {
    const bands = rankBands(rows);
    expect(bands.every((b) => b.count >= 3)).toBe(true);
    expect(bands.find((b) => b.from <= 300 && b.to > 300)?.count).toBeGreaterThanOrEqual(1);
  });
});
