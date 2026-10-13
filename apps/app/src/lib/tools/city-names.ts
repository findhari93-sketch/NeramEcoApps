/**
 * City names in tool page titles. Pure (no React cache), so it is unit-tested
 * in city-names.test.ts; geo-pages.ts re-exports both.
 */
import { INDIAN_CITIES, STATES, type GeoCity } from '@neram/geo';

const stateBySlug = new Map(STATES.map((s) => [s.slug, s]));

/**
 * A city named like its state (Delhi in Delhi, Chandigarh): its page lists the
 * same colleges under the same title as the state page, so only the state page
 * is indexed.
 */
export function sameNameAsState(city: GeoCity): boolean {
  return stateBySlug.get(city.stateSlug)?.name.toLowerCase() === city.name.toLowerCase();
}

/** City names used by more than one Indian city (Aurangabad, Bijapur, Bilaspur, Udaipur). */
const SHARED_CITY_NAMES = (() => {
  const seen = new Map<string, number>();
  for (const c of INDIAN_CITIES) seen.set(c.name.toLowerCase(), (seen.get(c.name.toLowerCase()) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
})();

/** "Aurangabad, Bihar" when another city shares the name, so two pages never share a title. */
export function distinctCityName(city: { name: string; stateSlug: string }): string {
  if (!SHARED_CITY_NAMES.has(city.name.toLowerCase())) return city.name;
  const state = stateBySlug.get(city.stateSlug)?.name;
  return state ? `${city.name}, ${state}` : city.name;
}
