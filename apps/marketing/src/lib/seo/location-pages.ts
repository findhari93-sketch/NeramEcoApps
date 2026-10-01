/**
 * Shared loading for the city and state coaching routes, so the NATA and
 * JEE Paper 2 routes stay thin and can never disagree with the sitemap.
 */
import type { Metadata } from 'next';
import { GULF_CITIES, INDIAN_CITIES, STATES, getCity, getState, resolveCitySlug } from '@/data/geo';
import type { CityPlace, GeoState } from '@/data/geo';
import { CITY_CONTENT } from '@/data/geo/content/cities';
import { STATE_CONTENT } from '@/data/geo/content/states';
import { haversineKm } from '@/lib/geo/haversine';
import { BASE_URL } from './constants';
import { EXAMS, JEE_CITY_PREFIX, NATA_CITY_PREFIX, type ExamKey } from './exam-config';
import { cityDescription, cityTitle, stateDescription, stateTitle } from './location-copy';
import { computeCityFacts, computeStateFacts, type CityFacts, type GeoDatasets, type StateFacts } from './location-facts';
import { evaluateCityGate, evaluateStateGate, type GateResult } from './location-gate';
import { buildOgImage } from './metadata';

const CITY_PREFIX: Record<ExamKey, string> = { nata: NATA_CITY_PREFIX, 'jee-paper-2': JEE_CITY_PREFIX };

/** The city slug inside a city-page URL segment ("nata-coaching-centers-in-chennai" -> "chennai"). */
export function citySlugFromSegment(exam: ExamKey, segment: string): string | null {
  const prefix = CITY_PREFIX[exam];
  return segment.startsWith(prefix) ? segment.slice(prefix.length) || null : null;
}

export function citySegment(exam: ExamKey, citySlug: string): string {
  return `${CITY_PREFIX[exam]}${citySlug}`;
}

export type CityLookup =
  | { kind: 'page'; place: CityPlace }
  | { kind: 'redirect'; to: string }
  | { kind: 'not-found' };

/** Resolve a URL segment to a city, an alias redirect, or a 404. */
export function lookupCity(exam: ExamKey, segment: string): CityLookup {
  const raw = citySlugFromSegment(exam, segment);
  if (!raw) return { kind: 'not-found' };
  const resolved = resolveCitySlug(raw.toLowerCase());
  if (!resolved) return { kind: 'not-found' };
  if (resolved.isAlias || resolved.slug !== raw) return { kind: 'redirect', to: EXAMS[exam].cityPath(resolved.slug) };
  const place = getCity(resolved.slug);
  // JEE Paper 2 pages cover India only.
  if (!place || (exam === 'jee-paper-2' && place.kind !== 'india')) return { kind: 'not-found' };
  return { kind: 'page', place };
}

export function cityFactsFor(exam: ExamKey, place: CityPlace, ds: GeoDatasets): { facts: CityFacts; gate: GateResult } {
  const facts = computeCityFacts(exam, place, ds, CITY_CONTENT[place.slug] ?? null);
  return { facts, gate: evaluateCityGate(facts) };
}

export function stateFactsFor(exam: ExamKey, state: GeoState, ds: GeoDatasets): { facts: StateFacts; gate: GateResult } {
  const facts = computeStateFacts(exam, state, ds, STATE_CONTENT[state.slug] ?? null);
  return { facts, gate: evaluateStateGate(facts) };
}

/** Every city page for an exam with its gate result (sitemap, directory, llms.txt). */
export function allCityGates(exam: ExamKey, ds: GeoDatasets): Array<{ place: CityPlace; facts: CityFacts; gate: GateResult }> {
  const places: CityPlace[] = [
    ...INDIAN_CITIES.map((c) => getCity(c.slug)!),
    ...(exam === 'nata' ? GULF_CITIES.map((g) => getCity(g.slug)!) : []),
  ];
  return places.map((place) => ({ place, ...cityFactsFor(exam, place, ds) }));
}

export function allStateGates(exam: ExamKey, ds: GeoDatasets) {
  return STATES.map((state) => ({ state, ...stateFactsFor(exam, state, ds) }));
}

/**
 * Up to `limit` nearby city pages in the same state (or Gulf country), nearest
 * first, preferring pages that are indexed so link equity goes where it counts.
 */
export function nearbyCities(
  exam: ExamKey,
  place: CityPlace,
  ds: GeoDatasets,
  limit = 6,
): Array<{ label: string; href: string; hint: string }> {
  const pool: CityPlace[] =
    place.kind === 'india'
      ? INDIAN_CITIES.filter((c) => c.stateSlug === place.stateSlug && c.slug !== place.slug).map((c) => getCity(c.slug)!)
      : exam === 'nata'
        ? GULF_CITIES.filter((g) => g.slug !== place.slug).map((g) => getCity(g.slug)!)
        : [];
  const ranked = pool
    .map((p) => ({ p, km: haversineKm(place, p) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit * 3)
    .map(({ p, km }) => ({ p, km, indexed: cityFactsFor(exam, p, ds).gate.index }))
    .sort((a, b) => Number(b.indexed) - Number(a.indexed) || a.km - b.km)
    .slice(0, limit);
  return ranked.map(({ p, km }) => ({
    label: p.name,
    href: EXAMS[exam].cityPath(p.slug),
    hint: `about ${Math.round(km / 5) * 5 || 1} km away`,
  }));
}

/** Cities prebuilt at deploy: classroom cities and the largest metros. Everything else renders on first visit. */
export function prebuiltCitySlugs(exam: ExamKey): string[] {
  if (exam !== 'nata') return [];
  const classroom = ['chennai', 'tambaram', 'kanchipuram', 'coimbatore', 'tiruppur', 'trichy', 'madurai', 'pudukkottai', 'bangalore'];
  const metros = INDIAN_CITIES.filter((c) => c.tier === 1).map((c) => c.slug);
  return Array.from(new Set([...classroom, ...metros])).filter((s) => getCity(s));
}

// ─── Metadata ──────────────────────────────────────────────────────────────

const robotsFor = (gate: GateResult): Metadata['robots'] =>
  gate.index ? { index: true, follow: true } : { index: false, follow: true };

export function cityMetadata(facts: CityFacts, gate: GateResult): Metadata {
  const exam = EXAMS[facts.exam];
  const path = exam.cityPath(facts.place.slug);
  const title = cityTitle(facts);
  const description = cityDescription(facts);
  return {
    title,
    description,
    // English only: location pages have no translations (non-English URLs 301 to English).
    alternates: { canonical: `${BASE_URL}${path}` },
    robots: robotsFor(gate),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BASE_URL}${path}`,
      images: [{ url: buildOgImage(`${exam.name} Coaching in ${facts.place.name}`, facts.regionName, 'coaching'), width: 1200, height: 630 }],
    },
  };
}

export function stateMetadata(facts: StateFacts, gate: GateResult): Metadata {
  const exam = EXAMS[facts.exam];
  const path = exam.statePath(facts.state.slug);
  const title = stateTitle(facts);
  const description = stateDescription(facts);
  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}${path}` },
    robots: robotsFor(gate),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BASE_URL}${path}`,
      images: [{ url: buildOgImage(`${exam.name} Coaching in ${facts.state.name}`, 'Online and classroom', 'coaching'), width: 1200, height: 630 }],
    },
  };
}

export { getState };
