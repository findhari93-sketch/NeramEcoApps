/** Registry types for the "NATA coaching in {place}" pages. */

export type StateRegion = 'south' | 'west' | 'north' | 'central' | 'east' | 'northeast' | 'islands';

export interface GeoState {
  /** Matches colleges.state_slug, e.g. "tamil-nadu". */
  slug: string;
  name: string;
  type: 'state' | 'ut';
  capital: string;
  region: StateRegion;
  /** Keys into HUB_REGISTRY (data/counselling-2026) for the state's B.Arch counselling. */
  counsellingHubs: string[];
}

export interface GeoCity {
  /** URL slug. Legacy slugs are kept exactly as they were (e.g. "bangalore", "trichy"). */
  slug: string;
  name: string;
  stateSlug: string;
  district: string | null;
  lat: number;
  lng: number;
  /** GeoNames population; 0 when unknown or unreliable. Used for ordering, never shown. */
  population: number;
  tier: 1 | 2 | 3;
  isDistrictHQ: boolean;
  /** Present on the cities that already had a page before the nationwide registry. */
  legacy?: true;
  /** Other names for the same place (GeoNames name when the display name differs). */
  altNames?: string[];
}

export interface GulfCity {
  slug: string;
  name: string;
  countrySlug: string;
  countryName: string;
  lat: number;
  lng: number;
  population: number;
}

/** Any place a city coaching page can be about. */
export type CityPlace =
  | ({ kind: 'india' } & GeoCity)
  | ({ kind: 'gulf'; stateSlug: string; district: null } & GulfCity);
