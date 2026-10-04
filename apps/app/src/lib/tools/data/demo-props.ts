/**
 * Trimmed data the demos embed in the page, so a visitor's clicks cost no
 * request. Keep these small: they ship in the HTML of every page that uses them.
 */
import { INDIAN_CITIES } from '@neram/geo';
import type { DemoCentre, DemoCity } from '@/features/tools/exam-centers/ExamCentresDemo';
import { STATES_BY_NAME } from '../places';
import type { DemoCoa } from '@/features/tools/coa-checker/CoaDemo';
import type { Centre, CoaCollege } from './facts';

export function demoCentres(centres: Centre[]): DemoCentre[] {
  return centres.map((c) => ({
    label: c.label,
    state: c.stateSlug,
    lat: Math.round(c.lat * 1e4) / 1e4,
    lng: Math.round(c.lng * 1e4) / 1e4,
    combined: c.isCombined,
    cities: c.citySlugs,
    confirmed: c.confirmed,
    venue: null,
  }));
}

/** Every registry city as [slug, name, state, lat, lng]; about 40 KB before compression. */
export function demoCities(stateSlug?: string): DemoCity[] {
  return INDIAN_CITIES.filter((c) => !stateSlug || c.stateSlug === stateSlug).map((c) => [
    c.slug,
    c.name,
    c.stateSlug,
    Math.round(c.lat * 1e3) / 1e3,
    Math.round(c.lng * 1e3) / 1e3,
  ]);
}

export function demoStates(): Array<{ slug: string; name: string }> {
  return STATES_BY_NAME.map((s) => ({ slug: s.slug, name: s.name }));
}

const stateName = new Map(STATES_BY_NAME.map((s) => [s.slug, s.name]));

/** COA list for the search demo: [name, city, state, period]. */
export function demoCoa(colleges: CoaCollege[]): DemoCoa[] {
  return colleges.map((c) => [c.name, c.city, stateName.get(c.stateSlug) ?? c.stateSlug, c.period ?? '']);
}

/** For the cost demo: each state's test cities, or the nearest ones to its capital with km. */
export function demoCentresByState(states: Array<{ state: { slug: string }; facts: { centres: Centre[]; nearestToCapital: Array<{ centre: Centre; km: number | null }> } }>) {
  const out: Record<string, Array<{ label: string; km: number | null }>> = {};
  for (const s of states) {
    out[s.state.slug] =
      s.facts.centres.length > 0
        ? s.facts.centres.map((c) => ({ label: c.label, km: null }))
        : s.facts.nearestToCapital.map((n) => ({ label: n.centre.label, km: n.km }));
  }
  return out;
}
