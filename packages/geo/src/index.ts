/**
 * @neram/geo: the place registry behind every "{tool or course} in {place}"
 * page. Used by apps/marketing (coaching pages) and apps/app (tool pages), so
 * both sites agree on slugs, aliases and distances.
 *
 * Only marketing and app depend on this package; deploy.yml routes changes
 * here to those two apps only.
 */
export * from './registry';
export { haversineKm, roundKm } from './haversine';
export type { LatLng } from './haversine';
export { scoreGate } from './gate';
export type { GateSignal, GateResult, GateRules } from './gate';

/** Attribution GeoNames requires wherever its coordinates or populations are used. */
export const GEONAMES_ATTRIBUTION = 'Place data: GeoNames (geonames.org), CC BY 4.0';
