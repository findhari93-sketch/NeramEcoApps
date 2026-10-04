import { describe, it, expect } from 'vitest';
import { getCity } from '@/data/geo';
import { FIXTURE_DATASETS, centreRow } from './__fixtures__/geo-datasets';
import type { CentrePhoto } from './centre-photos';
import { computeCityFacts, type GeoDatasets } from './location-facts';
import { cityDescription, cityH1, cityTitle } from './location-copy';
import { evaluateCityGate } from './location-gate';
import { TRAVEL_FROM_KM, centreOgImage, robotsFor, travelFromCities } from './location-pages';
import { generateCentreSchema } from './schemas';

const HOST = 'https://db.neramclasses.com/storage/v1/object/public/centre-photos/chennai';
const photo = (n: number, over: Partial<CentrePhoto> = {}): CentrePhoto => ({
  url: `${HOST}/chennai-classroom-${n}.webp`,
  og: `${HOST}/chennai-classroom-${n}-og.jpg`,
  alt: `Neram classroom in Ashok Nagar, Chennai, photo ${n}`,
  kind: 'classroom',
  width: 1600,
  height: 1200,
  hero: n === 1,
  ...over,
});

const withChennai = (over: Parameters<typeof centreRow>[0]): GeoDatasets => ({
  ...FIXTURE_DATASETS,
  centres: [centreRow({ areaLabel: 'Ashok Nagar, Chennai', ...over }), ...FIXTURE_DATASETS.centres.slice(1)],
});

const city = (slug: string) => getCity(slug)!;

describe('centre page title, H1 and description', () => {
  it('a classroom city answers "coaching centre in {city}" with its locality', () => {
    const f = computeCityFacts('nata', city('chennai'), withChennai({}));
    expect(cityTitle(f)).toBe('NATA Coaching Centre in Chennai: Ashok Nagar Classroom');
    expect(cityH1(f)).toBe('NATA Coaching Centre in Chennai');
  });

  it('falls back when the locality would push the title past 60 characters', () => {
    const f = computeCityFacts('jee-paper-2', city('chennai'), withChennai({ areaLabel: 'Ashok Nagar Sector Thirteen, Chennai' }));
    expect(cityTitle(f)).toBe('JEE Paper 2 Coaching Centre in Chennai: Classroom and Online');
  });

  it('an online city keeps the online title and H1', () => {
    const f = computeCityFacts('nata', city('jaipur'), FIXTURE_DATASETS);
    expect(cityTitle(f)).toBe('NATA Coaching in Jaipur: Live Online Classes');
    expect(cityH1(f)).toBe('NATA Coaching in Jaipur');
  });

  it('the description leads with the street and landmark', () => {
    const f = computeCityFacts('nata', city('chennai'), withChennai({ address: '2nd Floor, PT Rajan Rd, Ashok Nagar', landmark: 'Near Lakshmi Shruthi Signal' }));
    expect(cityDescription(f)).toMatch(/^NATA coaching centre at 2nd Floor, PT Rajan Rd, Ashok Nagar, Chennai \(Near Lakshmi Shruthi Signal\)\./);
  });
});

describe('telling Google about the photos', () => {
  it('indexed pages ask for large image previews; noindexed pages do not', () => {
    expect(robotsFor({ index: true, score: 5, reasons: [] })).toMatchObject({ googleBot: { 'max-image-preview': 'large' } });
    expect(robotsFor({ index: false, score: 0, reasons: [] })).toEqual({ index: false, follow: true });
  });

  it('a classroom city shares its hero photo; others keep the generated card', () => {
    const f = computeCityFacts('nata', city('chennai'), withChennai({ photos: [photo(1), photo(2)] }));
    expect(centreOgImage(f)).toEqual({ url: `${HOST}/chennai-classroom-1-og.jpg`, width: 1200, height: 630, alt: photo(1).alt });
    expect(centreOgImage(computeCityFacts('nata', city('kanchipuram'), withChennai({ photos: [photo(1)] })))).toBeNull();
    expect(centreOgImage(computeCityFacts('nata', city('chennai'), withChennai({ photos: [photo(1, { og: null })] })))).toBeNull();
  });

  it('the centre schema lists the real photos, the opening year and the towns served', () => {
    const centre = centreRow({ areaLabel: 'Ashok Nagar, Chennai', photos: [photo(1), photo(2)], establishedYear: 2016, nearbyCities: ['Avadi'] });
    const s = generateCentreSchema(centre, 'https://neramclasses.com/x', { areaServed: ['Kanchipuram', 'Avadi'] }) as Record<string, unknown>;
    expect(s.image).toEqual([photo(1).url, photo(2).url]);
    expect((s.photo as Array<{ caption: string }>)[0]).toMatchObject({ '@type': 'ImageObject', caption: photo(1).alt, width: 1600, height: 1200 });
    expect(s.foundingDate).toBe('2016');
    expect((s.areaServed as Array<{ name: string }>).map((a) => a.name)).toEqual(['Chennai', 'Avadi', 'Kanchipuram']);
    expect(s).not.toHaveProperty('aggregateRating');
  });

  it('without photos the schema falls back to the logo and has no photo list', () => {
    const s = generateCentreSchema(centreRow({}), 'https://neramclasses.com/x') as Record<string, unknown>;
    expect(typeof s.image).toBe('string');
    expect(s).not.toHaveProperty('photo');
    expect(s).not.toHaveProperty('foundingDate');
  });
});

describe('travelFromCities', () => {
  it('lists nearby towns in the same state, without a classroom of their own, within the travel radius', () => {
    const list = travelFromCities('nata', city('chennai'), FIXTURE_DATASETS);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((t) => t.km <= TRAVEL_FROM_KM)).toBe(true);
    expect(list.some((t) => t.href.endsWith('-chennai'))).toBe(false);
    expect(list.map((t) => t.label)).toContain('Kanchipuram');
    expect(list.every((t) => t.href.startsWith('/coaching/nata-coaching/nata-coaching-centers-in-'))).toBe(true);
  });

  it('leaves a town to the classroom nearer to it', () => {
    const k = city('kanchipuram');
    const ds: GeoDatasets = {
      ...FIXTURE_DATASETS,
      centres: [...FIXTURE_DATASETS.centres, centreRow({ slug: 'near-k', citySlug: 'near-k', city: 'Near K', lat: k.lat + 0.02, lng: k.lng })],
    };
    const labels = travelFromCities('nata', city('chennai'), ds).map((t) => t.label);
    expect(labels).not.toContain('Kanchipuram');
    const list = travelFromCities('nata', city('chennai'), FIXTURE_DATASETS);
    expect(list.map((t) => t.km)).toEqual([...list.map((t) => t.km)].sort((a, b) => a - b));
  });

  it('is empty for Gulf cities', () => {
    expect(travelFromCities('nata', city('dubai'), FIXTURE_DATASETS)).toEqual([]);
  });
});

describe('gate: centre photos', () => {
  it('four real photos of the page own classroom are a strong fact', () => {
    const without = evaluateCityGate(computeCityFacts('nata', city('chennai'), withChennai({})));
    const withPhotos = evaluateCityGate(computeCityFacts('nata', city('chennai'), withChennai({ photos: [1, 2, 3, 4].map((n) => photo(n)) })));
    expect(without.reasons).not.toContain('centre-photos');
    expect(withPhotos.reasons).toContain('centre-photos');
    expect(withPhotos.score - without.score).toBe(2);
  });

  it('photos of a nearby classroom do not count for another town', () => {
    const g = evaluateCityGate(computeCityFacts('nata', city('kanchipuram'), withChennai({ photos: [1, 2, 3, 4].map((n) => photo(n)) })));
    expect(g.reasons).not.toContain('centre-photos');
  });
});
