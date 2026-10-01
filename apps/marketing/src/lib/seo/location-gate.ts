/**
 * Decides whether a location page is indexed. One function, used by the page's
 * robots meta, the sitemap, the all-India directory and llms.txt, so they can
 * never disagree.
 *
 * A city page is indexed only when it carries enough real, local facts that it
 * is genuinely different from every other city page. Pages that fail stay
 * reachable for students (noindex, follow) and start ranking once someone adds
 * local content. This is what keeps ~800 location pages from reading as
 * doorway pages to Google.
 */
import { countWords, type CityFacts, type StateFacts } from './location-facts';

export const GATE = {
  /** A NATA test city this close is a strong local fact. */
  TEST_CITY_NEAR_KM: 25,
  /** ...and this close, a weak one. */
  TEST_CITY_REGION_KM: 75,
  /** A Neram classroom within this distance is a strong fact. */
  CLASSROOM_KM: 40,
  /** Hand-written local content of at least this many words is a strong fact. */
  MIN_CONTENT_WORDS: 120,
  /** This many exam-relevant colleges in the state is a weak fact. */
  MIN_STATE_COLLEGES: 3,
  STRONG: 2,
  WEAK: 1,
  MIN_SCORE: 3,
} as const;

export interface GateResult {
  index: boolean;
  score: number;
  reasons: string[];
}

/** Places that must never be indexed, whatever their facts say. */
const FORCE_NOINDEX = new Set<string>([]);

export function evaluateCityGate(facts: CityFacts): GateResult {
  const reasons: string[] = [];
  let score = 0;
  let strong = 0;
  const add = (points: number, reason: string) => {
    score += points;
    if (points === GATE.STRONG) strong++;
    reasons.push(reason);
  };

  const nearestTest = facts.testCities[0];
  const testKm = nearestTest ? (nearestTest.inThisCity ? 0 : nearestTest.km) : null;
  if (testKm !== null && testKm <= GATE.TEST_CITY_NEAR_KM) add(GATE.STRONG, 'nata-test-city-near');
  else if (testKm !== null && testKm <= GATE.TEST_CITY_REGION_KM) add(GATE.WEAK, 'nata-test-city-region');

  if (facts.localCollegeCount > 0) add(GATE.STRONG, 'college-in-city-or-district');
  else if (facts.stateCollegeCount >= GATE.MIN_STATE_COLLEGES) add(GATE.WEAK, 'colleges-in-state');

  if (facts.classroom && facts.classroom.km <= GATE.CLASSROOM_KM) add(GATE.STRONG, 'classroom-near');

  if (facts.contentWords >= GATE.MIN_CONTENT_WORDS) add(GATE.STRONG, 'local-content');

  // The state's own B.Arch counselling route is shown on the page and differs by state.
  if (facts.counsellingHubs.length > 0) add(GATE.WEAK, 'state-counselling');

  if (FORCE_NOINDEX.has(facts.place.slug)) return { index: false, score, reasons: [...reasons, 'force-noindex'] };
  return { index: score >= GATE.MIN_SCORE && strong >= 1, score, reasons };
}

/**
 * A state page is indexed when the state has at least one real B.Arch fact or
 * hand-written content about its architecture.
 */
export function evaluateStateGate(facts: StateFacts): GateResult {
  const reasons: string[] = [];
  if (facts.collegeCount > 0) reasons.push('colleges-in-state');
  if (facts.testCities.length > 0) reasons.push('nata-test-city-in-state');
  if (facts.counsellingHubs.length > 0) reasons.push('state-counselling');
  if (facts.classrooms.length > 0) reasons.push('classroom-in-state');
  if (countWords(facts.content) >= GATE.MIN_CONTENT_WORDS) reasons.push('local-content');
  return { index: reasons.length > 0, score: reasons.length, reasons };
}
