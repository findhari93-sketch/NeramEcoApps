/**
 * Location registry for the location pages: 36 states/UTs, every
 * district seat and large city in India (cities.generated.ts) and the Gulf
 * cities with online students. Shared by marketing and the Tools app; editing
 * it redeploys only those two.
 */
import { GENERATED_CITIES } from './cities.generated';
import { GULF_CITIES } from './gulf-cities.generated';
import { STATES } from './states';
import CITY_ALIASES from './city-aliases.json';
import type { CityPlace, GeoCity, GeoState, GulfCity } from './types';

export type { CityPlace, GeoCity, GeoState, GulfCity, StateRegion } from './types';
export { STATES, GENERATED_CITIES as INDIAN_CITIES, GULF_CITIES };

const ALIASES: Record<string, string> = CITY_ALIASES;

/** Alias slug -> canonical city slug ("bengaluru" -> "bangalore"). */
export const CITY_ALIAS_MAP: Readonly<Record<string, string>> = ALIASES;

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
/** Every city a key can mean: four names are shared across states (Aurangabad, Bilaspur, Bijapur, Udaipur). */
const citiesByKey = new Map<string, string[]>();
function indexName(name: string, slug: string) {
  const k = placeKey(name);
  if (!k) return;
  if (!cityByKey.has(k)) cityByKey.set(k, slug);
  const all = citiesByKey.get(k) ?? [];
  if (!all.includes(slug)) citiesByKey.set(k, [...all, slug]);
}
// Slugs first: "aurangabad" is the Maharashtra city whose slug it is, not the
// Bihar town that is also named Aurangabad (its slug is aurangabad-bihar).
for (const c of GENERATED_CITIES) indexName(c.slug, c.slug);
for (const c of GENERATED_CITIES) {
  indexName(c.name, c.slug);
  for (const a of c.altNames ?? []) indexName(a, c.slug);
}
for (const [alias, target] of Object.entries(ALIASES)) indexName(alias, target);

/**
 * The registry city a free-text place name refers to, e.g. "Mysuru" -> "mysore".
 * Pass the state when it is known: a shared name then resolves to the town in
 * that state ("Aurangabad" in Bihar -> aurangabad-bihar).
 */
export function cityForName(name: string | null | undefined, stateSlug?: string | null): string | null {
  if (!name) return null;
  const k = placeKey(name);
  if (stateSlug) {
    const inState = (citiesByKey.get(k) ?? []).find((s) => cityBySlug.get(s)?.stateSlug === stateSlug);
    if (inState) return inState;
  }
  return cityByKey.get(k) ?? null;
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
