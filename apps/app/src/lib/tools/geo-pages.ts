/**
 * Every state and city page of every tool, with its facts and its index
 * decision. Pages, the sitemap, llms.txt and the /tools directory all read
 * this one list, so they can never disagree about which pages exist and which
 * are indexed.
 *
 *   exists && index   -> in the sitemap, `index, follow`
 *   exists && !index  -> reachable for students, `noindex, follow`
 *   !exists           -> 404 (nothing local to say, so no thin page at all)
 */
import { cache } from 'react';
import { INDIAN_CITIES, STATES, type GeoCity, type GeoState, type GateResult } from '@neram/geo';
import { sameNameAsState } from './city-names';
import { foldSameAnswer } from './same-answer';
import {
  centresInState,
  coaCityGate,
  collegesNear,
  examCentreCityGate,
  examCentreCityHasPage,
  nearestCentres,
  predictorCityGate,
  stateIndexedIf,
  type Centre,
  type CoaCollege,
  type CutoffCollege,
  type NearCentre,
} from './data/facts';
import { loadCentres, loadCoaColleges, loadCutoffColleges, loadMarketingColleges } from './data/loaders';

export { distinctCityName, sameNameAsState } from './city-names';

export const GEO_BASE = {
  examCentres: '/tools/nata/exam-centers',
  costCalculator: '/tools/nata/cost-calculator',
  collegePredictor: '/tools/counseling/college-predictor',
  coaChecker: '/tools/counseling/coa-checker',
} as const;

export type GeoTool = keyof typeof GEO_BASE;

export interface StatePage<F> {
  tool: GeoTool;
  state: GeoState;
  path: string;
  gate: GateResult;
  facts: F;
}

export interface CityPage<F> {
  tool: GeoTool;
  city: GeoCity;
  state: GeoState;
  path: string;
  gate: GateResult;
  facts: F;
  /** Other towns with the same answer; this page is indexed for all of them. */
  answersFor: GeoCity[];
  /** The indexed page that answers for this town when it has the same answer as a stronger one. */
  answeredBy: { path: string; name: string } | null;
}

/**
 * Folds towns with the same answer into the strongest one (see same-answer.ts):
 * the others are held (`noindex, follow`) and named on the indexed page.
 */
function foldPages<F>(pages: CityPage<F>[], keyOf: (p: CityPage<F>) => string): CityPage<F>[] {
  // Big cities (tier 1 and 2) keep their own page: students search them by name and
  // Google treats them as distinct places. Only smaller towns fold.
  const key = (p: CityPage<F>) => (p.city.tier <= 2 ? `own:${p.city.slug}` : keyOf(p));
  const { leaderOf, members } = foldSameAnswer(pages.map((p) => ({ slug: p.city.slug, key: key(p), index: p.gate.index, score: p.gate.score, population: p.city.population })));
  const bySlug = new Map(pages.map((p) => [p.city.slug, p]));
  return pages.map((p) => {
    const leader = leaderOf.get(p.city.slug) ?? p.city.slug;
    if (leader !== p.city.slug) {
      const lead = bySlug.get(leader)!;
      return { ...p, gate: { ...p.gate, index: false, reasons: [...p.gate.reasons, `same-answer-as-${leader}`] }, answeredBy: { path: lead.path, name: lead.city.name } };
    }
    return { ...p, answersFor: (members.get(p.city.slug) ?? []).map((slug) => bySlug.get(slug)!.city) };
  });
}

const stateBySlug = new Map(STATES.map((s) => [s.slug, s]));


// ─── Exam centres ─────────────────────────────────────────────────────────

export interface CentreStateFacts {
  centres: Centre[];
  /** For states with no test city: nearest ones to the capital. */
  nearestToCapital: NearCentre[];
}

export interface CentreCityFacts {
  near: NearCentre[];
  stateCentres: Centre[];
  collegesNearby: number;
}

export const examCentrePages = cache(async () => {
  const [centres, mkt] = await Promise.all([loadCentres(), loadMarketingColleges()]);
  const states: StatePage<CentreStateFacts>[] = STATES.map((state) => {
    const inState = centresInState(state.slug, centres);
    const capital = INDIAN_CITIES.find((c) => c.stateSlug === state.slug && c.name === state.capital) ?? INDIAN_CITIES.find((c) => c.stateSlug === state.slug);
    return {
      tool: 'examCentres',
      state,
      path: `${GEO_BASE.examCentres}/${state.slug}`,
      gate: stateIndexedIf(inState.length),
      facts: { centres: inState, nearestToCapital: capital && inState.length === 0 ? nearestCentres(capital, centres, 3) : [] },
    };
  });
  let cities: CityPage<CentreCityFacts>[] = [];
  for (const city of INDIAN_CITIES) {
    const near = nearestCentres(city, centres, 5);
    if (!examCentreCityHasPage(near)) continue;
    const { inCity, inDistrict } = collegesNear(city, mkt.map((m) => ({ ...m, citySlug: m.cityPageSlug })));
    const collegesNearby = inCity.length + inDistrict.length;
    cities.push({
      tool: 'examCentres',
      city,
      state: stateBySlug.get(city.stateSlug)!,
      path: `${GEO_BASE.examCentres}/${city.stateSlug}/${city.slug}`,
      gate: examCentreCityGate(city, near, collegesNearby),
      facts: { near, stateCentres: centresInState(city.stateSlug, centres), collegesNearby },
      answersFor: [],
      answeredBy: null,
    });
  }
  // Same nearest test city = the same answer to "where do I write NATA?". The test
  // city's own page usually leads its set (it scores highest) and lists the towns
  // around it; towns in different states stay apart (state pages list them).
  cities = foldPages(cities, (p) => `${p.state.slug}|${p.facts.near[0]?.centre.label ?? p.city.slug}`);
  return { centres, states, cities };
});

// ─── Cost calculator (state only) ─────────────────────────────────────────

export const costPages = cache(async () => {
  const { states } = await examCentrePages();
  return states.map((s): StatePage<CentreStateFacts> => ({ ...s, tool: 'costCalculator', path: `${GEO_BASE.costCalculator}/${s.state.slug}` }));
});

// ─── College predictor ────────────────────────────────────────────────────

export interface PredictorStateFacts {
  colleges: CutoffCollege[];
  coaCount: number;
}

export interface PredictorCityFacts {
  inCity: CutoffCollege[];
  inDistrict: CutoffCollege[];
  stateColleges: CutoffCollege[];
}

export const predictorPages = cache(async () => {
  const [colleges, coa] = await Promise.all([loadCutoffColleges(), loadCoaColleges()]);
  const states: StatePage<PredictorStateFacts>[] = [];
  for (const state of STATES) {
    const inState = colleges.filter((c) => c.stateSlug === state.slug);
    const coaCount = coa.filter((c) => c.stateSlug === state.slug).length;
    // A state with neither cutoffs nor a single approved college has nothing to show.
    if (inState.length === 0 && coaCount === 0) continue;
    states.push({
      tool: 'collegePredictor',
      state,
      path: `${GEO_BASE.collegePredictor}/${state.slug}`,
      gate: stateIndexedIf(inState.length, 3),
      facts: { colleges: inState, coaCount },
    });
  }
  let cities: CityPage<PredictorCityFacts>[] = [];
  for (const city of INDIAN_CITIES) {
    const stateColleges = colleges.filter((c) => c.stateSlug === city.stateSlug);
    if (stateColleges.length === 0) continue;
    const { inCity, inDistrict } = collegesNear(city, stateColleges);
    if (inCity.length + inDistrict.length === 0) continue;
    cities.push({
      tool: 'collegePredictor',
      city,
      state: stateBySlug.get(city.stateSlug)!,
      path: `${GEO_BASE.collegePredictor}/${city.stateSlug}/${city.slug}`,
      gate: predictorCityGate(inCity.length, inDistrict.length, stateColleges.length >= 3),
      facts: { inCity, inDistrict, stateColleges },
      answersFor: [],
      answeredBy: null,
    });
  }
  // Towns with no college of their own show their district's list: one page per district list.
  cities = foldPages(cities, (p) => (p.facts.inCity.length ? `city|${p.city.slug}` : `district|${p.facts.inDistrict.map((c) => `${c.system}:${c.code}`).sort().join(',')}`));
  return { colleges, states, cities };
});

// ─── COA checker ──────────────────────────────────────────────────────────

export interface CoaStateFacts {
  colleges: CoaCollege[];
}

export interface CoaCityFacts {
  inCity: CoaCollege[];
  stateCount: number;
}

export const coaPages = cache(async () => {
  const coa = await loadCoaColleges();
  const states: StatePage<CoaStateFacts>[] = [];
  for (const state of STATES) {
    const inState = coa.filter((c) => c.stateSlug === state.slug).sort((a, b) => a.name.localeCompare(b.name));
    if (inState.length === 0) continue;
    states.push({ tool: 'coaChecker', state, path: `${GEO_BASE.coaChecker}/${state.slug}`, gate: stateIndexedIf(inState.length, 3), facts: { colleges: inState } });
  }
  const cities: CityPage<CoaCityFacts>[] = [];
  const byCity = new Map<string, CoaCollege[]>();
  for (const c of coa) if (c.citySlug) byCity.set(c.citySlug, [...(byCity.get(c.citySlug) ?? []), c]);
  for (const city of INDIAN_CITIES) {
    const inCity = byCity.get(city.slug);
    if (!inCity?.length) continue;
    cities.push({
      tool: 'coaChecker',
      city,
      state: stateBySlug.get(city.stateSlug)!,
      path: `${GEO_BASE.coaChecker}/${city.stateSlug}/${city.slug}`,
      gate: sameNameAsState(city) ? { ...coaCityGate(inCity.length), index: false } : coaCityGate(inCity.length),
      facts: { inCity: [...inCity].sort((a, b) => a.name.localeCompare(b.name)), stateCount: coa.filter((c) => c.stateSlug === city.stateSlug).length },
      answersFor: [],
      answeredBy: null,
    });
  }
  return { coa, states, cities };
});

// ─── Everything, for the sitemap, llms.txt and the directory ──────────────

/** When the page template last changed; a page's lastmod is never older. */
export const TEMPLATE_UPDATED_AT = '2026-10-01';

const later = (...dates: Array<string | null | undefined>) =>
  dates.filter((d): d is string => !!d).map((d) => d.slice(0, 10)).sort().pop() ?? TEMPLATE_UPDATED_AT;

export interface GeoPageSummary {
  tool: GeoTool;
  path: string;
  index: boolean;
  /** YYYY-MM-DD: changes only when the data or the template does. */
  lastModified: string;
  label: string;
  kind: 'state' | 'city';
  stateSlug: string;
}

export const allGeoPages = cache(async (): Promise<GeoPageSummary[]> => {
  const [ec, cost, pred, coa] = await Promise.all([examCentrePages(), costPages(), predictorPages(), coaPages()]);
  const dates: Record<GeoTool, string> = {
    examCentres: later(TEMPLATE_UPDATED_AT, ...ec.centres.map((c) => c.updatedAt)),
    costCalculator: later(TEMPLATE_UPDATED_AT, ...ec.centres.map((c) => c.updatedAt)),
    collegePredictor: later(TEMPLATE_UPDATED_AT, ...pred.colleges.map((c) => `${c.year}-09-01`)),
    coaChecker: later(TEMPLATE_UPDATED_AT, ...coa.coa.map((c) => c.checkedAt)),
  };
  const out: GeoPageSummary[] = [];
  const add = (p: StatePage<unknown> | CityPage<unknown>) =>
    out.push({
      tool: p.tool,
      path: p.path,
      index: p.gate.index,
      lastModified: dates[p.tool],
      label: 'city' in p ? p.city.name : p.state.name,
      kind: 'city' in p ? 'city' : 'state',
      stateSlug: p.state.slug,
    });
  [...ec.states, ...ec.cities, ...cost, ...pred.states, ...pred.cities, ...coa.states, ...coa.cities].forEach(add);
  return out;
});

/** Every city page of a tool in a state, biggest first, for the state page's full town list. */
export function allCities<F>(cities: CityPage<F>[], stateSlug: string): CityPage<F>[] {
  return cities.filter((c) => c.state.slug === stateSlug).sort((a, b) => b.city.population - a.city.population);
}

/** Indexed city pages of a tool in a state, biggest first: the internal links a state page carries. */
export function indexedCities<F>(cities: CityPage<F>[], stateSlug: string, limit = 60): CityPage<F>[] {
  return cities
    .filter((c) => c.state.slug === stateSlug && c.gate.index)
    .sort((a, b) => b.city.population - a.city.population)
    .slice(0, limit);
}
