/**
 * Turning /{state}/{city} URL segments into registry places. Aliases and a
 * city under the wrong state get a permanent redirect to the one canonical
 * URL; unknown slugs are a 404.
 */
import { getCity, getState, resolveCitySlug, STATES, type GeoCity, type GeoState } from '@neram/geo';

export type PlaceLookup<T> = { kind: 'ok'; value: T } | { kind: 'redirect'; to: string } | { kind: 'missing' };

export function lookupState(stateSlug: string): PlaceLookup<GeoState> {
  const state = getState(stateSlug);
  return state ? { kind: 'ok', value: state } : { kind: 'missing' };
}

export function lookupCity(basePath: string, stateSlug: string, citySlug: string): PlaceLookup<GeoCity> {
  const resolved = resolveCitySlug(citySlug);
  if (!resolved) return { kind: 'missing' };
  const place = getCity(resolved.slug);
  if (!place || place.kind !== 'india') return { kind: 'missing' };
  if (resolved.isAlias || place.stateSlug !== stateSlug) {
    return { kind: 'redirect', to: `${basePath}/${place.stateSlug}/${place.slug}` };
  }
  const { kind: _kind, ...city } = place;
  return { kind: 'ok', value: city as GeoCity };
}

/** States in a stable reading order (by name). */
export const STATES_BY_NAME: GeoState[] = [...STATES].sort((a, b) => a.name.localeCompare(b.name));
