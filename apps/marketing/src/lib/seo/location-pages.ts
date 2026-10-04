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
import { MAX_SIMILARITY, cityPageText, jaccard, shingles } from './location-similarity';
import { buildOgImage } from './metadata';

const CITY_PREFIX: Record<ExamKey, string> = { nata: NATA_CITY_PREFIX, 'jee-paper-2': JEE_CITY_PREFIX };

/**
 * GeoNames rows that are the same place as another city (same centre point or
 * a twin town). Each 301s to the one page, so two pages never compete.
 */
export const MERGED_CITY_SLUGS: Readonly<Record<string, string>> = {
  'bengaluru-rural': 'bangalore',
  mormugao: 'vasco',
  'gadag-betageri': 'gadag',
};

export const isMergedCity = (slug: string) => slug in MERGED_CITY_SLUGS;

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
  const merged = MERGED_CITY_SLUGS[raw.toLowerCase()];
  if (merged) return { kind: 'redirect', to: EXAMS[exam].cityPath(merged) };
  const resolved = resolveCitySlug(raw.toLowerCase());
  if (!resolved) {
    // Old URL shapes reach here as "in-chennai" or "center-in-tamil-nadu":
    // strip the stray words and send states to their hub.
    const bare = raw.toLowerCase().replace(/^(?:(?:centers?|centres?)-)?in-/, '');
    if (getState(bare)) return { kind: 'redirect', to: EXAMS[exam].statePath(bare) };
    const retry = bare !== raw.toLowerCase() ? resolveCitySlug(bare) : null;
    if (retry) return { kind: 'redirect', to: EXAMS[exam].cityPath(retry.slug) };
    return { kind: 'not-found' };
  }
  if (resolved.isAlias || resolved.slug !== raw) return { kind: 'redirect', to: EXAMS[exam].cityPath(resolved.slug) };
  const place = getCity(resolved.slug);
  // JEE Paper 2 pages cover India only.
  if (!place || (exam === 'jee-paper-2' && place.kind !== 'india')) return { kind: 'not-found' };
  return { kind: 'page', place };
}

type CityGate = { place: CityPlace; facts: CityFacts; gate: GateResult };

/** Facts and the fact gate for one city, before the similarity pass. */
function rawCityGate(exam: ExamKey, place: CityPlace, ds: GeoDatasets): CityGate {
  const facts = computeCityFacts(exam, place, ds, CITY_CONTENT[place.slug] ?? null);
  return { place, facts, gate: evaluateCityGate(facts) };
}

/**
 * Pages that pass the fact gate but read like another indexed page (shared text
 * above MAX_SIMILARITY) leave the index. The strongest page of each cluster
 * (highest score, then the larger city) stays, so the cluster still ranks.
 */
const population = (p: CityPlace) => ('population' in p && typeof p.population === 'number' ? p.population : 0);

function applySimilarityGate(rows: CityGate[]): CityGate[] {
  const candidates = rows
    .filter((r) => r.gate.index)
    .sort((a, b) => b.gate.score - a.gate.score || population(b.place) - population(a.place));
  const kept: Array<{ slug: string; set: Set<string> }> = [];
  const demoted = new Map<string, string>();
  for (const r of candidates) {
    const set = shingles(cityPageText(r.facts));
    const twin = kept.find((k) => jaccard(set, k.set) > MAX_SIMILARITY);
    if (twin) demoted.set(r.place.slug, twin.slug);
    else kept.push({ slug: r.place.slug, set });
  }
  return rows.map((r) =>
    demoted.has(r.place.slug)
      ? { ...r, gate: { ...r.gate, index: false, reasons: [...r.gate.reasons, `too-similar-to-${demoted.get(r.place.slug)}`] } }
      : r,
  );
}

const gateCache = new WeakMap<GeoDatasets, Map<ExamKey, Map<string, CityGate>>>();

function gatesFor(exam: ExamKey, ds: GeoDatasets): Map<string, CityGate> {
  let byExam = gateCache.get(ds);
  if (!byExam) gateCache.set(ds, (byExam = new Map()));
  let gates = byExam.get(exam);
  if (!gates) {
    const places: CityPlace[] = [
      ...INDIAN_CITIES.filter((c) => !isMergedCity(c.slug)).map((c) => getCity(c.slug)!),
      ...(exam === 'nata' ? GULF_CITIES.map((g) => getCity(g.slug)!) : []),
    ];
    gates = new Map(applySimilarityGate(places.map((p) => rawCityGate(exam, p, ds))).map((g) => [g.place.slug, g]));
    byExam.set(exam, gates);
  }
  return gates;
}

/** Facts and the final index decision for one city page (fact gate plus similarity). */
export function cityFactsFor(exam: ExamKey, place: CityPlace, ds: GeoDatasets): { facts: CityFacts; gate: GateResult } {
  const g = gatesFor(exam, ds).get(place.slug) ?? rawCityGate(exam, place, ds);
  return { facts: g.facts, gate: g.gate };
}

export function stateFactsFor(exam: ExamKey, state: GeoState, ds: GeoDatasets): { facts: StateFacts; gate: GateResult } {
  const facts = computeStateFacts(exam, state, ds, STATE_CONTENT[state.slug] ?? null);
  return { facts, gate: evaluateStateGate(facts) };
}

/** Every city page for an exam with its gate result (sitemap, directory, llms.txt). */
export function allCityGates(exam: ExamKey, ds: GeoDatasets): CityGate[] {
  return [...gatesFor(exam, ds).values()];
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
      ? INDIAN_CITIES.filter((c) => c.stateSlug === place.stateSlug && c.slug !== place.slug && !isMergedCity(c.slug)).map((c) => getCity(c.slug)!)
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

/** How far students commonly travel to a classroom, for "Students travel here from". */
export const TRAVEL_FROM_KM = 120;

/**
 * "Students travel here from": towns within TRAVEL_FROM_KM of a classroom city
 * that have no classroom of their own, larger towns first. Same state only
 * (a centre page is a local page). Links go to each town's own page.
 */
export function travelFromCities(
  exam: ExamKey,
  place: CityPlace,
  ds: GeoDatasets,
  limit = 10,
): Array<{ label: string; href: string; km: number }> {
  if (place.kind !== 'india') return [];
  const withCentre = new Set(ds.centres.map((c) => c.citySlug));
  // A town belongs to its nearest classroom: Karur students go to Trichy, not Madurai.
  const own = ds.centres.filter((c) => c.citySlug === place.slug);
  const others = ds.centres.filter((c) => c.citySlug !== place.slug);
  const closest = (p: { lat: number; lng: number }, list: typeof own) => (list.length ? Math.min(...list.map((c) => haversineKm(p, c))) : Infinity);
  return INDIAN_CITIES.filter((c) => c.stateSlug === place.stateSlug && c.slug !== place.slug && !withCentre.has(c.slug) && !isMergedCity(c.slug))
    .map((c) => ({ c, km: haversineKm(place, c) }))
    .filter(({ c, km }) => km <= TRAVEL_FROM_KM && (own.length === 0 || closest(c, own) <= closest(c, others)))
    // The largest towns make the list; it then reads nearest first.
    .sort((a, b) => b.c.population - a.c.population || a.km - b.km)
    .slice(0, limit)
    .sort((a, b) => a.km - b.km)
    .map(({ c, km }) => ({ label: c.name, href: EXAMS[exam].cityPath(c.slug), km: Math.round(km) }));
}

/** Cities prebuilt at deploy: classroom cities and the largest metros. Everything else renders on first visit. */
export function prebuiltCitySlugs(exam: ExamKey): string[] {
  if (exam !== 'nata') return [];
  const classroom = ['chennai', 'tambaram', 'kanchipuram', 'coimbatore', 'tiruppur', 'trichy', 'madurai', 'pudukkottai', 'bangalore'];
  const metros = INDIAN_CITIES.filter((c) => c.tier === 1 && !isMergedCity(c.slug)).map((c) => c.slug);
  return Array.from(new Set([...classroom, ...metros])).filter((s) => getCity(s));
}

// ─── Metadata ──────────────────────────────────────────────────────────────

/**
 * A page-level robots object replaces the layout's, so the large image preview
 * (a photo thumbnail in results) must be repeated here or it is lost.
 */
export const robotsFor = (gate: GateResult): Metadata['robots'] =>
  gate.index
    ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } }
    : { index: false, follow: true };

/** The centre hero photo's 1200x630 rendition, for a classroom city's share card and result thumbnail. */
export function centreOgImage(facts: CityFacts): { url: string; width: number; height: number; alt: string } | null {
  if (facts.mode !== 'classroom') return null;
  const hero = facts.centres.flatMap((c) => c.photos ?? []).find((p) => p.og);
  return hero?.og ? { url: hero.og, width: 1200, height: 630, alt: hero.alt } : null;
}

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
      images: [centreOgImage(facts) ?? { url: buildOgImage(`${exam.name} Coaching in ${facts.place.name}`, facts.regionName, 'coaching'), width: 1200, height: 630 }],
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
