import { describe, it, expect } from 'vitest';
import { getCity, getState } from '@/data/geo';
import { FIXTURE_DATASETS, centreRow, examRow } from './__fixtures__/geo-datasets';
import { dropSharedProfiles } from './facts';
import { computeCityFacts, computeStateFacts, parseExamCentre, type GeoDatasets } from './location-facts';
import { evaluateCityGate, evaluateStateGate, GATE } from './location-gate';

const ds: GeoDatasets = FIXTURE_DATASETS;
const exam = examRow;

const city = (slug: string) => {
  const c = getCity(slug);
  if (!c) throw new Error(`no city ${slug}`);
  return c;
};

describe('parseExamCentre', () => {
  it('cleans labels and marks rows that name two cities as combined', () => {
    expect(parseExamCentre(exam('Dubai (UAE)', 'International', 25.2, 55.27))).toMatchObject({ label: 'Dubai', stateSlug: 'international', isCombined: false });
    const combined = parseExamCentre(exam('Kottayam / Thrissur', 'Kerala', 10, 76))!;
    expect(combined.isCombined).toBe(true);
    expect(combined.citySlugs).toEqual(expect.arrayContaining(['kottayam', 'thrissur']));
  });
});

describe('computeCityFacts', () => {
  it('Chennai: classroom mode, a test city in the city, local colleges first', () => {
    const f = computeCityFacts('nata', city('chennai'), ds);
    expect(f.mode).toBe('classroom');
    expect(f.classroom?.url).toBe('/coaching/nata-coaching/nata-coaching-centers-in-chennai#visit');
    expect(f.testCities[0]).toMatchObject({ label: 'Chennai', inThisCity: true, km: 0 });
    expect(f.colleges[0]).toMatchObject({ slug: 'anna', match: 'city', url: '/colleges/tamil-nadu/anna' });
    expect(f.counsellingHubs).toEqual(['tnea-barch']);
  });

  it('matches a college by its alternate city name (mysuru -> mysore)', () => {
    const f = computeCityFacts('nata', city('mysore'), ds);
    expect(f.localCollegeCount).toBe(1);
  });

  it('never gives a distance from a two-city test row, but counts it for the named city', () => {
    const thrissur = computeCityFacts('nata', city('thrissur'), ds);
    expect(thrissur.testCities[0]).toMatchObject({ label: 'Kottayam / Thrissur', inThisCity: true });
    const kochi = computeCityFacts('nata', city('kochi'), ds);
    expect(kochi.testCities.some((t) => t.label === 'Kottayam / Thrissur')).toBe(false);
  });

  it('far from any centre the mode is online and no classroom is claimed', () => {
    const f = computeCityFacts('nata', city('jaipur'), ds);
    expect(f.mode).toBe('online');
    expect(f.classroom).toBeNull();
  });

  it('a city near (but not at) a centre is online with the nearest classroom named', () => {
    const f = computeCityFacts('nata', city('kanchipuram'), ds);
    expect(f.mode).toBe('online-near-classroom');
    expect(f.classroom?.centre.slug).toBe('chennai');
  });

  it('counts JEE-only colleges for JEE Paper 2 but not for NATA', () => {
    expect(computeCityFacts('nata', city('patna'), ds).localCollegeCount).toBe(0);
    expect(computeCityFacts('jee-paper-2', city('patna'), ds).localCollegeCount).toBe(1);
  });

  it('claims a classroom only on the centre own city page, never by distance', () => {
    // Bengaluru Rural sits 0 km from Bangalore and within 15 km of the HQ but has no centre of its own.
    expect(computeCityFacts('nata', city('bengaluru-rural'), ds).mode).toBe('online-near-classroom');
    expect(computeCityFacts('nata', city('bangalore'), ds).mode).toBe('classroom');
  });

  it('Gulf cities use international test cities and have no classroom', () => {
    const f = computeCityFacts('nata', city('dubai'), ds);
    expect(f.testCities[0].label).toBe('Dubai');
    expect(f.mode).toBe('online');
    expect(f.regionName).toBe('United Arab Emirates');
  });
});

describe('evaluateCityGate', () => {
  it('indexes a city with several strong local facts', () => {
    const g = evaluateCityGate(computeCityFacts('nata', city('chennai'), ds));
    expect(g.index).toBe(true);
    expect(g.reasons).toEqual(expect.arrayContaining(['nata-test-city-near', 'college-in-city-or-district', 'classroom-near']));
  });

  it('keeps a page with only weak, state-level facts out of the index', () => {
    const g = evaluateCityGate(computeCityFacts('nata', city('kota'), ds));
    expect(g.index).toBe(false);
  });

  it('reviewed local content plus a weak fact is enough', () => {
    const words = Array.from({ length: GATE.MIN_CONTENT_WORDS }, () => 'word').join(' ');
    const f = computeCityFacts('nata', city('kota'), ds, { localContext: words, highlights: [], reviewed: true, updatedAt: '2026-10-01' });
    const g = evaluateCityGate(f);
    expect(g.reasons).toEqual(expect.arrayContaining(['local-content', 'state-counselling']));
    expect(g.index).toBe(true);
  });

  it('unreviewed AI-drafted content alone never indexes a page', () => {
    const words = Array.from({ length: GATE.MIN_CONTENT_WORDS }, () => 'word').join(' ');
    const f = computeCityFacts('nata', city('kota'), ds, { localContext: words, highlights: [], updatedAt: '2026-10-01' });
    const g = evaluateCityGate(f);
    expect(g.reasons).toContain('local-content-unreviewed');
    expect(g.index).toBe(false);
  });

  it('indexes JEE Paper 2 city pages only for cities with a classroom', () => {
    expect(evaluateCityGate(computeCityFacts('jee-paper-2', city('chennai'), ds)).index).toBe(true);
    const patna = evaluateCityGate(computeCityFacts('jee-paper-2', city('patna'), ds));
    expect(patna.index).toBe(false);
    expect(patna.reasons).toContain('jee-city-without-classroom');
  });
});

describe('state facts and gate', () => {
  it('Tamil Nadu: colleges, test cities and its classroom are listed', () => {
    const f = computeStateFacts('nata', getState('tamil-nadu')!, ds);
    expect(f.collegeCount).toBe(1);
    expect(f.testCities.map((t) => t.label)).toEqual(['Chennai']);
    expect(f.classrooms.map((c) => c.centre.slug)).toEqual(['chennai']);
    expect(evaluateStateGate(f).index).toBe(true);
  });

  it('lists AAT colleges separately', () => {
    const f = computeStateFacts('nata', getState('uttarakhand')!, ds);
    expect(f.aatColleges.map((c) => c.slug)).toEqual(['iitr']);
  });

  it('a UT with no B.Arch facts and no content is not indexed', () => {
    expect(evaluateStateGate(computeStateFacts('nata', getState('lakshadweep')!, ds)).index).toBe(false);
  });
});

describe('dropSharedProfiles', () => {
  it('drops a Google profile link that two centres share', () => {
    const out = dropSharedProfiles([
      centreRow({ slug: 'a', gbpUrl: 'https://share.google/x' }),
      centreRow({ slug: 'b', gbpUrl: 'https://share.google/x' }),
      centreRow({ slug: 'c', gbpUrl: 'https://share.google/y' }),
    ]);
    expect(out.map((c) => c.gbpUrl)).toEqual([null, null, 'https://share.google/y']);
  });
});
