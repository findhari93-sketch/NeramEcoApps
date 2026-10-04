/**
 * Real, per-place facts for the coaching location pages: nearest NATA test
 * cities, local B.Arch colleges, the nearest Neram classroom and the state's
 * counselling route. Pure functions over datasets the page loads once
 * (see location-data.ts), so the rules are unit-tested without a database.
 *
 * Honesty rules:
 *  - A NATA test city row that names two cities ("Kottayam / Thrissur") carries
 *    one coordinate for both, so it is used only when it names this city, never
 *    for a distance.
 *  - Distances are straight-line and rounded (roundKm).
 *  - "Classroom" is claimed only on a centre's own city page (centre.citySlug).
 */
import { cityForName, getState, placeKey, stateSlugForName } from '@/data/geo';
import type { CityPlace, GeoState } from '@/data/geo';
import type { CityContent } from '@/data/geo/content/cities';
import type { StateContent } from '@/data/geo/content/states';
import { haversineKm, roundKm } from '@/lib/geo/haversine';
import type { ClassroomCentre } from './facts';
import { EXAMS, acceptsAat, type ExamKey } from './exam-config';

/** Bump when the page template changes in a way search engines should re-read. */
export const TEMPLATE_UPDATED_AT = '2026-10-01';

/** A second centre this close shows on the page as "also in {area}". */
export const SIBLING_CENTRE_KM = 30;

/** The centre section on its city page, the one page per classroom. */
export function centrePageUrl(centre: ClassroomCentre): string {
  return `${EXAMS.nata.cityPath(centre.citySlug)}#visit`;
}
export const NEAR_CLASSROOM_KM = 150;
const MAX_TEST_CITIES = 3;
const MAX_CITY_COLLEGES = 8;
const MAX_STATE_COLLEGES = 12;

// ─── Dataset rows ──────────────────────────────────────────────────────────

export interface ExamCentreRow {
  city_brochure: string;
  state: string;
  latitude: number | string | null;
  longitude: number | string | null;
  confidence: string | null;
  tcs_ion_confirmed: boolean | null;
  year: number | null;
  updated_at: string | null;
}

export interface CollegeRow {
  slug: string;
  name: string;
  short_name: string | null;
  city: string | null;
  city_slug: string | null;
  district: string | null;
  state_slug: string;
  type: string | null;
  accepted_exams: string[] | null;
  counseling_systems: string[] | null;
  nirf_rank_architecture: number | null;
  updated_at: string | null;
}

export interface GeoDatasets {
  examCentres: ExamCentreRow[];
  colleges: CollegeRow[];
  centres: ClassroomCentre[];
}

// ─── Facts ─────────────────────────────────────────────────────────────────

export interface TestCityFact {
  /** As printed in the brochure, cleaned ("Dubai (UAE)" -> "Dubai"). */
  label: string;
  stateSlug: string;
  /** Rounded straight-line km, or null when the row cannot give a distance. */
  km: number | null;
  inThisCity: boolean;
  /** HIGH confidence or a confirmed TCS iON venue. */
  confirmed: boolean;
  year: number;
}

export interface CollegeFact {
  slug: string;
  name: string;
  shortName: string | null;
  city: string | null;
  stateSlug: string;
  type: string | null;
  nirfRank: number | null;
  url: string;
  match: 'city' | 'district' | 'state';
}

export interface ClassroomFact {
  centre: ClassroomCentre;
  /** Rounded km. */
  km: number;
  url: string;
}

export type TeachingMode = 'classroom' | 'online-near-classroom' | 'online';

export interface CityFacts {
  exam: ExamKey;
  place: CityPlace;
  /** State name, or the country name for a Gulf city. */
  regionName: string;
  state: GeoState | null;
  testCities: TestCityFact[];
  colleges: CollegeFact[];
  /** Colleges in this city or district for this exam. */
  localCollegeCount: number;
  stateCollegeCount: number;
  classroom: ClassroomFact | null;
  mode: TeachingMode;
  /** Centres whose own page this is (two in Pudukkottai). Empty off-centre. */
  centres: ClassroomCentre[];
  /** Other centres within SIBLING_CENTRE_KM, e.g. Tambaram on the Chennai page. */
  siblingCentres: ClassroomFact[];
  counsellingHubs: string[];
  content: CityContent | null;
  contentWords: number;
  lastModified: string;
}

export interface StateFacts {
  exam: ExamKey;
  state: GeoState;
  colleges: CollegeFact[];
  collegeCount: number;
  aatColleges: CollegeFact[];
  testCities: TestCityFact[];
  classrooms: ClassroomFact[];
  counsellingHubs: string[];
  content: StateContent | null;
  lastModified: string;
}

// ─── Exam centre parsing ───────────────────────────────────────────────────

interface ParsedExamCentre {
  label: string;
  stateSlug: string;
  citySlugs: string[];
  isCombined: boolean;
  lat: number;
  lng: number;
  confirmed: boolean;
  year: number;
  updatedAt: string | null;
}

export function parseExamCentre(row: ExamCentreRow): ParsedExamCentre | null {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = row.city_brochure.replace(/\s*\((?:UAE|U\.A\.E\.)\)\s*/i, '').replace(/\s+District$/i, '').trim();
  const parts = label.split(/\s*\/\s*|\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
  const isCombined = parts.length > 1 || /periphery/i.test(label);
  const stateSlug = /international/i.test(row.state) ? 'international' : stateSlugForName(row.state);
  return {
    label,
    stateSlug,
    citySlugs: parts.map((p) => cityForName(p)).filter((s): s is string => s !== null),
    isCombined,
    lat,
    lng,
    confirmed: row.confidence === 'HIGH' || row.tcs_ion_confirmed === true,
    year: row.year ?? 0,
    updatedAt: row.updated_at,
  };
}

function testCitiesFor(place: CityPlace, rows: ExamCentreRow[]): TestCityFact[] {
  const wantInternational = place.kind === 'gulf';
  const facts: TestCityFact[] = [];
  for (const row of rows) {
    const p = parseExamCentre(row);
    if (!p || (p.stateSlug === 'international') !== wantInternational) continue;
    const inThisCity = p.citySlugs.includes(place.slug);
    if (p.isCombined && !inThisCity) continue;
    const km = p.isCombined ? null : roundKm(haversineKm(place, p));
    facts.push({ label: p.label, stateSlug: p.stateSlug, km: inThisCity ? 0 : km, inThisCity, confirmed: p.confirmed, year: p.year });
  }
  return facts
    .sort((a, b) => Number(b.inThisCity) - Number(a.inThisCity) || (a.km ?? 1e9) - (b.km ?? 1e9))
    .slice(0, MAX_TEST_CITIES);
}

// ─── Colleges ──────────────────────────────────────────────────────────────

function collegeUrl(c: CollegeRow): string {
  return `/colleges/${c.state_slug}/${c.slug}`;
}

function toCollegeFact(c: CollegeRow, match: CollegeFact['match']): CollegeFact {
  return {
    slug: c.slug,
    name: c.name,
    shortName: c.short_name,
    city: c.city,
    stateSlug: c.state_slug,
    type: c.type,
    nirfRank: c.nirf_rank_architecture,
    url: collegeUrl(c),
    match,
  };
}

const byRankThenName = (a: CollegeRow, b: CollegeRow) =>
  (a.nirf_rank_architecture ?? 1e6) - (b.nirf_rank_architecture ?? 1e6) || a.name.localeCompare(b.name);

/** The registry city a college sits in, from its city slug, city name or district seat. */
function collegeCity(c: CollegeRow): string | null {
  return cityForName(c.city_slug) ?? cityForName(c.city);
}

function sameDistrict(c: CollegeRow, place: CityPlace): boolean {
  if (!place.district) return false;
  if (c.district) {
    if (placeKey(c.district) === placeKey(place.district)) return true;
    const a = cityForName(c.district);
    if (a && a === cityForName(place.district)) return true;
  }
  return false;
}

// ─── City facts ────────────────────────────────────────────────────────────

const latest = (dates: Array<string | null | undefined>): string =>
  dates
    .filter((d): d is string => !!d)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .reduce((max, d) => (d > max ? d : max), new Date(TEMPLATE_UPDATED_AT))
    .toISOString();

export function countWords(content: CityContent | StateContent | null | undefined): number {
  if (!content) return 0;
  const text = [
    'localContext' in content ? content.localContext : undefined,
    'intro' in content ? content.intro : undefined,
    'description' in content ? content.description : undefined,
    ...(content.highlights ?? []),
  ]
    .filter(Boolean)
    .join(' ');
  return text.split(/\s+/).filter(Boolean).length;
}

export function computeCityFacts(
  examKey: ExamKey,
  place: CityPlace,
  ds: GeoDatasets,
  content: CityContent | null = null,
): CityFacts {
  const exam = EXAMS[examKey];
  const state = place.kind === 'india' ? getState(place.stateSlug) ?? null : null;

  const testCities = exam.usesNataTestCities ? testCitiesFor(place, ds.examCentres) : [];

  let colleges: CollegeFact[] = [];
  let localCollegeCount = 0;
  let stateCollegeCount = 0;
  const usedColleges: CollegeRow[] = [];
  if (place.kind === 'india') {
    const inState = ds.colleges.filter((c) => c.state_slug === place.stateSlug && exam.collegeAccepts(c));
    const city = inState.filter((c) => collegeCity(c) === place.slug).sort(byRankThenName);
    const district = inState.filter((c) => !city.includes(c) && sameDistrict(c, place)).sort(byRankThenName);
    const rest = inState.filter((c) => !city.includes(c) && !district.includes(c)).sort(byRankThenName);
    localCollegeCount = city.length + district.length;
    stateCollegeCount = inState.length;
    const picked = [
      ...city.map((c) => ({ c, m: 'city' as const })),
      ...district.map((c) => ({ c, m: 'district' as const })),
      ...rest.map((c) => ({ c, m: 'state' as const })),
    ].slice(0, MAX_CITY_COLLEGES);
    colleges = picked.map(({ c, m }) => toCollegeFact(c, m));
    usedColleges.push(...picked.map(({ c }) => c));
  }

  // "Classroom" belongs to the centre's own city page only. Distance alone once
  // made "Bengaluru Rural" read "Classroom and Online" with no centre there.
  let classroom: ClassroomFact | null = null;
  let ownCentre = false;
  let own: ClassroomCentre[] = [];
  let siblingCentres: ClassroomFact[] = [];
  if (place.kind === 'india') {
    own = ds.centres.filter((c) => c.citySlug === place.slug);
    if (own.length) {
      siblingCentres = ds.centres
        .filter((c) => c.citySlug !== place.slug)
        .map((centre) => ({ centre, km: haversineKm(place, centre), url: centrePageUrl(centre) }))
        .filter((f) => f.km <= SIBLING_CENTRE_KM)
        .sort((a, b) => a.km - b.km)
        .map((f) => ({ ...f, km: roundKm(f.km) }));
    }
    for (const centre of own.length ? own : ds.centres) {
      const km = haversineKm(place, centre);
      if (!classroom || km < classroom.km) classroom = { centre, km, url: centrePageUrl(centre) };
    }
    if (classroom) classroom = { ...classroom, km: roundKm(classroom.km) };
    ownCentre = own.length > 0;
  }
  const mode: TeachingMode = !classroom
    ? 'online'
    : ownCentre
      ? 'classroom'
      : classroom.km <= NEAR_CLASSROOM_KM
        ? 'online-near-classroom'
        : 'online';

  return {
    exam: examKey,
    place,
    regionName: place.kind === 'gulf' ? place.countryName : state?.name ?? '',
    state,
    testCities,
    colleges,
    localCollegeCount,
    stateCollegeCount,
    classroom: mode === 'online' ? null : classroom,
    mode,
    centres: own,
    siblingCentres,
    counsellingHubs: state?.counsellingHubs ?? [],
    content,
    contentWords: countWords(content),
    lastModified: latest([
      content?.updatedAt,
      ...usedColleges.map((c) => c.updated_at),
      mode !== 'online' ? classroom?.centre.updatedAt : null,
    ]),
  };
}

// ─── State facts ───────────────────────────────────────────────────────────

export function computeStateFacts(
  examKey: ExamKey,
  state: GeoState,
  ds: GeoDatasets,
  content: StateContent | null = null,
): StateFacts {
  const exam = EXAMS[examKey];
  const inState = ds.colleges.filter((c) => c.state_slug === state.slug);
  const forExam = inState.filter((c) => exam.collegeAccepts(c)).sort(byRankThenName);
  const aat = inState.filter(acceptsAat).sort(byRankThenName);

  const testCities: TestCityFact[] = exam.usesNataTestCities
    ? ds.examCentres
        .map(parseExamCentre)
        .filter((p): p is ParsedExamCentre => !!p && p.stateSlug === state.slug)
        .map((p) => ({ label: p.label, stateSlug: p.stateSlug, km: null, inThisCity: false, confirmed: p.confirmed, year: p.year }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];

  const stateName = placeKey(state.name);
  const classrooms = ds.centres
    .filter((c) => placeKey(c.state) === stateName)
    .map((centre) => ({ centre, km: 0, url: centrePageUrl(centre) }));

  return {
    exam: examKey,
    state,
    colleges: forExam.slice(0, MAX_STATE_COLLEGES).map((c) => toCollegeFact(c, 'state')),
    collegeCount: forExam.length,
    aatColleges: aat.map((c) => toCollegeFact(c, 'state')),
    testCities,
    classrooms,
    counsellingHubs: state.counsellingHubs,
    content,
    lastModified: latest([content?.updatedAt, ...forExam.map((c) => c.updated_at), ...classrooms.map((c) => c.centre.updatedAt)]),
  };
}
