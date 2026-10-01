/**
 * Location registry for the coaching location pages: 36 states/UTs, every
 * district seat and large city in India (cities.generated.ts) and the Gulf
 * cities with online students. Marketing-only, so editing it never redeploys
 * the other apps.
 */
import { GENERATED_CITIES } from './cities.generated';
import { GULF_CITIES } from './gulf-cities.generated';
import { STATES } from './states';
import CITY_ALIASES from './city-aliases.json';
import type { CityPlace, GeoCity, GeoState, GulfCity } from './types';

export type { CityPlace, GeoCity, GeoState, GulfCity, StateRegion } from './types';
export { STATES, GENERATED_CITIES as INDIAN_CITIES, GULF_CITIES };

const ALIASES: Record<string, string> = CITY_ALIASES;

const stateBySlug = new Map(STATES.map((s) => [s.slug, s]));
const cityBySlug = new Map<string, CityPlace>();
for (const c of GENERATED_CITIES) cityBySlug.set(c.slug, { kind: 'india', ...c });
for (const g of GULF_CITIES) cityBySlug.set(g.slug, { kind: 'gulf', ...g, stateSlug: g.countrySlug, district: null });

export function getState(slug: string): GeoState | undefined {
  return stateBySlug.get(slug);
}

export function getCity(slug: string): CityPlace | undefined {
  return cityBySlug.get(slug);
}

/**
 * The canonical slug for a requested city slug: itself when it is a page, the
 * target when it is an alias ("bengaluru" -> "bangalore"), otherwise null.
 */
export function resolveCitySlug(slug: string): { slug: string; isAlias: boolean } | null {
  if (cityBySlug.has(slug)) return { slug, isAlias: false };
  const target = ALIASES[slug];
  return target && cityBySlug.has(target) ? { slug: target, isAlias: true } : null;
}

export function citiesInState(stateSlug: string): GeoCity[] {
  return GENERATED_CITIES.filter((c) => c.stateSlug === stateSlug).sort((a, b) => b.population - a.population);
}

export function gulfCitiesInCountry(countrySlug: string): GulfCity[] {
  return GULF_CITIES.filter((c) => c.countrySlug === countrySlug);
}

// ─── Name matching (colleges, exam centres, classroom centres) ─────────────

/** Lower-case letters only, so "Tiruchirappalli", "tiruchirappalli" and "Tiruchi-rappalli" agree. */
export function placeKey(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');
}

const cityByKey = new Map<string, string>();
function indexName(name: string, slug: string) {
  const k = placeKey(name);
  if (k && !cityByKey.has(k)) cityByKey.set(k, slug);
}
for (const c of GENERATED_CITIES) {
  indexName(c.slug, c.slug);
  indexName(c.name, c.slug);
  for (const a of c.altNames ?? []) indexName(a, c.slug);
}
for (const [alias, target] of Object.entries(ALIASES)) indexName(alias, target);

/** The registry city a free-text place name refers to, e.g. "Mysuru" -> "mysore". */
export function cityForName(name: string | null | undefined): string | null {
  if (!name) return null;
  return cityByKey.get(placeKey(name)) ?? null;
}

/** Slugify a state name the way colleges.state_slug does ("Jammu & Kashmir" -> "jammu-and-kashmir"). */
export function stateSlugForName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/^andaman-and-nicobar-islands$/, 'andaman-and-nicobar');
}
