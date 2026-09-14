/**
 * The shared rules for every full list of students in Nexus: who is hidden, how
 * the stage filter reads, how search and sort combine, and how that state sits
 * in the URL. PURE, so each rule is pinned by a unit test and every screen gets
 * the same behaviour.
 *
 * Founder rules (2026-09-13):
 * - A dormant (paused) student appears in no list and no count. The Students
 *   page's Dormant segment and the student profile are the only exceptions, and
 *   they do not use this module to hide anyone.
 * - Every list sorts by name, newest joined and oldest joined, plus whatever the
 *   screen itself needs (quiet longest, score).
 * - The stage filter follows the ring on the avatar, which is the STUDY STAGE:
 *   Break Year and Class 12 sit the exam this year, then Class 11, Class 10 and
 *   Not set. See lib/student-stage.ts.
 *
 * Rows differ between screens (id, student_id, user_id, userId...), so every
 * function takes accessors instead of assuming a shape.
 */

import { rankPeople } from './people-search';
import { STAGE_GROUP, type StageGroup, type StageKey } from './student-stage';

export type BaseSort = 'name' | 'joined_newest' | 'joined_oldest';

export const BASE_SORTS: readonly BaseSort[] = ['name', 'joined_newest', 'joined_oldest'];

/** Same wording as the Students page sort menu. */
export const BASE_SORT_LABEL: Record<BaseSort, string> = {
  name: 'Name A to Z',
  joined_newest: 'Newest joined',
  joined_oldest: 'Oldest joined',
};

export type StageFilterKey = StageGroup;

export const STAGE_FILTER_ORDER: readonly StageFilterKey[] = ['exam_this_year', 'exam_next_year', 'lower', 'unset'];

export const STAGE_FILTER_LABEL: Record<StageFilterKey, string> = {
  exam_this_year: 'Exam this year',
  exam_next_year: 'Class 11',
  lower: 'Class 10',
  unset: 'Not set',
};

export const STAGE_FILTER_HINT: Record<StageFilterKey, string> = {
  exam_this_year: 'Break Year and Class 12',
  exam_next_year: 'Exam next year',
  lower: 'Class 10',
  unset: 'No study stage recorded',
};

/** The ring colour each group borrows, so a chip matches the avatars it filters. */
export const STAGE_FILTER_RING: Record<StageFilterKey, StageKey> = {
  exam_this_year: 'gap_year',
  exam_next_year: '11th',
  lower: '10th',
  unset: 'unset',
};

export interface ListAccessors<T> {
  id: (row: T) => string;
  name: (row: T) => string | null | undefined;
  email?: (row: T) => string | null | undefined;
  /** When the student joined, for the joined sorts. Unknown sorts last. */
  joinedAt?: (row: T) => string | null | undefined;
  /** Dormant flag already on the row, when the payload carries one. */
  dormant?: (row: T) => boolean | null | undefined;
}

export interface ExtraSort<T, S extends string = string> {
  key: S;
  label: string;
  compare: (a: T, b: T) => number;
  /** Ties keep the order the rows arrived in, instead of falling back to name. */
  keepOrder?: boolean;
}

/**
 * The screen's own order, as a sort option: for lists whose order IS the
 * information (worst first, time in the room, a triage band). Search still ranks
 * by name match; this only decides the order when nothing is typed.
 */
export function suggestedOrder<T, S extends string = 'suggested'>(label = 'Suggested order', key = 'suggested' as S): ExtraSort<T, S> {
  return { key, label, compare: () => 0, keepOrder: true };
}

export type FactsLookup = (id: string) => { stage: StageKey; dormant: boolean } | null;

export function isDormantRow<T>(row: T, a: ListAccessors<T>, factsFor: FactsLookup): boolean {
  return a.dormant?.(row) === true || factsFor(a.id(row))?.dormant === true;
}

/**
 * `keep` rescues a dormant row the screen must still show, such as a test
 * attempt a paused student really made. A rescued row is kept, not counted as
 * hidden, and it is the screen's job to label it.
 */
export function dropDormant<T>(
  rows: readonly T[],
  a: ListAccessors<T>,
  factsFor: FactsLookup,
  keep?: (row: T) => boolean,
): { kept: T[]; paused: number } {
  const kept: T[] = [];
  let paused = 0;
  for (const row of rows) {
    if (!isDormantRow(row, a, factsFor) || keep?.(row)) kept.push(row);
    else paused += 1;
  }
  return { kept, paused };
}

export function stageGroupOf<T>(row: T, a: ListAccessors<T>, factsFor: FactsLookup): StageFilterKey {
  return STAGE_GROUP[factsFor(a.id(row))?.stage ?? 'unset'];
}

/** No stage picked means everyone. Several picked means any of them. */
export function filterByStages<T>(
  rows: readonly T[],
  stages: readonly StageFilterKey[],
  a: ListAccessors<T>,
  factsFor: FactsLookup,
): T[] {
  if (!stages.length) return [...rows];
  const wanted = new Set(stages);
  return rows.filter((row) => wanted.has(stageGroupOf(row, a, factsFor)));
}

export function countStages<T>(
  rows: readonly T[],
  a: ListAccessors<T>,
  factsFor: FactsLookup,
): Record<StageFilterKey, number> {
  const counts: Record<StageFilterKey, number> = { exam_this_year: 0, exam_next_year: 0, lower: 0, unset: 0 };
  for (const row of rows) counts[stageGroupOf(row, a, factsFor)] += 1;
  return counts;
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function byName<T>(a: ListAccessors<T>) {
  return (x: T, y: T) => collator.compare(a.name(x) || '', a.name(y) || '');
}

function byJoined<T>(a: ListAccessors<T>, newestFirst: boolean) {
  return (x: T, y: T) => {
    const jx = a.joinedAt?.(x) || '';
    const jy = a.joinedAt?.(y) || '';
    if (jx === jy) return byName(a)(x, y);
    if (!jx) return 1;
    if (!jy) return -1;
    return newestFirst ? jy.localeCompare(jx) : jx.localeCompare(jy);
  };
}

export function comparatorFor<T, S extends string>(
  sort: BaseSort | S,
  a: ListAccessors<T>,
  extra: readonly ExtraSort<T, S>[] = [],
): (x: T, y: T) => number {
  const custom = extra.find((e) => e.key === sort);
  if (custom) {
    return custom.keepOrder ? custom.compare : (x, y) => custom.compare(x, y) || byName(a)(x, y);
  }
  if (sort === 'joined_newest') return byJoined(a, true);
  if (sort === 'joined_oldest') return byJoined(a, false);
  return byName(a);
}

/**
 * Sort, then search. While a name is typed, relevance wins (a name that starts
 * with the letters first) and the chosen sort only breaks ties, the way every
 * people search a teacher already uses behaves.
 */
export function searchAndSort<T, S extends string = never>(
  rows: readonly T[],
  query: string,
  sort: BaseSort | S,
  a: ListAccessors<T>,
  extra: readonly ExtraSort<T, S>[] = [],
): T[] {
  const cmp = comparatorFor(sort, a, extra);
  if (!query.trim()) return [...rows].sort(cmp);
  const wrapped = rows.map((row) => ({ row, name: a.name(row) ?? null, email: a.email?.(row) ?? null }));
  return rankPeople(wrapped, query, (x, y) => cmp(x.row, y.row)).map((w) => w.row);
}

// ── URL state ───────────────────────────────────────────────────────────────

export interface ListUrlKeys {
  q: string;
  sort: string;
  stage: string;
  status: string;
}

export const DEFAULT_LIST_URL_KEYS: ListUrlKeys = { q: 'q', sort: 'sort', stage: 'stage', status: 'status' };

export interface ListState {
  q: string;
  sort: string;
  stages: StageFilterKey[];
  status: string;
}

/** Read list state from a query string. Anything unknown falls back to the default. */
export function parseListParams(
  search: string,
  allowed: { sorts: readonly string[]; statuses?: readonly string[] },
  defaults: ListState,
  keys: ListUrlKeys = DEFAULT_LIST_URL_KEYS,
): ListState {
  const params = new URLSearchParams(search);
  const sort = params.get(keys.sort);
  const status = params.get(keys.status);
  const stageRaw = params.get(keys.stage);
  const stages = stageRaw
    ? [...new Set(stageRaw.split(',').filter((s): s is StageFilterKey => (STAGE_FILTER_ORDER as readonly string[]).includes(s)))]
    : defaults.stages;
  return {
    q: params.get(keys.q) ?? defaults.q,
    sort: sort && allowed.sorts.includes(sort) ? sort : defaults.sort,
    stages,
    status: status && (status === 'all' || allowed.statuses?.includes(status)) ? status : defaults.status,
  };
}

/** The params to write: a value equal to its default is removed (null) so URLs stay short. */
export function listStateToParams(
  state: ListState,
  defaults: ListState,
  keys: ListUrlKeys = DEFAULT_LIST_URL_KEYS,
): Record<string, string | null> {
  const stageValue = STAGE_FILTER_ORDER.filter((s) => state.stages.includes(s)).join(',');
  const defaultStage = STAGE_FILTER_ORDER.filter((s) => defaults.stages.includes(s)).join(',');
  return {
    [keys.q]: state.q.trim() && state.q !== defaults.q ? state.q : null,
    [keys.sort]: state.sort !== defaults.sort ? state.sort : null,
    [keys.stage]: stageValue !== defaultStage ? stageValue : null,
    [keys.status]: state.status !== defaults.status ? state.status : null,
  };
}

/** "1 paused student is not shown." / "3 paused students are not shown." */
export function pausedFootnote(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? '1 paused student is not shown.' : `${count} paused students are not shown.`;
}
