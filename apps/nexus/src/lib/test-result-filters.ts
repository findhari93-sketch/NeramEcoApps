/**
 * The groups a teacher actually acts on, on the Students tab.
 *
 * PURE, so the tile counts and the rows behind them come from one function
 * rather than two. A tile that reads "Not passed 5" and then shows six students
 * is worse than no tile, because the teacher acts on the number.
 *
 * These read fields the results route already sends. Nothing here needs a
 * fetch, which is what makes filter-then-select-all a two-tap path rather than
 * a round trip.
 *
 * EVERYONE ADDS UP (2026-09-17). Done, Not done, Excused and the few still
 * mid-paper partition Everyone, so the numbers on the tiles can be checked by
 * eye. Not said why sits INSIDE Not done, and Passed, Not passed and Below
 * average sit inside Done: those are the ways into a group, never new people.
 *
 * Behind on catch-up is the one group that crosses that partition, on purpose.
 * It is everybody without a sitting whose catch-up for the classes this run
 * covers is still open, and most of them are Excused rather than Not done: a
 * student who joined after the class is not required to sit it, but is exactly
 * the person to chase, because finishing the catch-up opens the door for them.
 */

export type ResultFilter =
  | 'all'
  | 'did'
  | 'not_done'
  | 'no_reason'
  | 'excused'
  | 'behind'
  | 'passed'
  | 'below_pass'
  | 'below_avg';

/** In tile order. */
export const RESULT_FILTERS: ResultFilter[] = [
  'all',
  'did',
  'not_done',
  'no_reason',
  'behind',
  'excused',
  'passed',
  'below_pass',
  'below_avg',
];

export const RESULT_FILTER_LABELS: Record<ResultFilter, string> = {
  all: 'Everyone',
  did: 'Done',
  not_done: 'Not done',
  no_reason: 'Not said why',
  behind: 'Behind on catch-up',
  excused: 'Excused',
  passed: 'Passed',
  below_pass: 'Not passed',
  below_avg: 'Below average',
};

/** What each tile means, for the empty state when it matches nobody. */
export const RESULT_FILTER_EMPTY: Record<ResultFilter, string> = {
  all: 'Nobody is on this run yet.',
  did: 'Nobody has sat this yet.',
  not_done: 'Everybody has sat this one.',
  no_reason: 'Everybody who has not sat it has told you why.',
  behind: 'Nobody is held up by catch-up on this one.',
  excused: 'Nobody on this run is excused.',
  passed: 'Nobody has passed it yet.',
  below_pass: 'Nobody who sat it is below the pass mark.',
  below_avg: 'Nobody who sat it is below the class average.',
};

export interface FilterableRow {
  status: 'submitted' | 'in_progress' | 'not_started' | 'missed' | 'excused';
  passed: boolean | null;
  first_percentage?: number | null;
  best_percentage?: number | null;
  /** The reason the student gave for not sitting it, when they gave one. */
  why?: unknown | null;
  /** What they wrote when they asked to be let back in. */
  request_note?: string | null;
  /** Catch-up for the classes this run covers. See lib/run-catchup.ts. */
  catchup?: { state: 'attended' | 'caught_up' | 'behind' | 'unknown' } | null;
}

/**
 * What "below average" is measured against.
 *
 * It follows the First/Best toggle, both sides: the class average of first
 * attempts against each student's first attempt, or best against best. Mixing
 * them would call a student who improved "below average" on a number nobody
 * on screen is looking at.
 */
export interface ResultFilterContext {
  average: number | null;
  scoreShown: 'first' | 'best';
}

export function isResultFilter(v: unknown): v is ResultFilter {
  return typeof v === 'string' && (RESULT_FILTERS as string[]).includes(v);
}

/**
 * Has this student told the teacher anything about why they did not sit it?
 *
 * A reason from "Tell your teacher why", or a note on their ask to reopen. An
 * ask with nothing written is a request, not a reason.
 */
export function hasSaidWhy(row: Pick<FilterableRow, 'why' | 'request_note'>): boolean {
  return Boolean(row.why) || Boolean(row.request_note && row.request_note.trim());
}

/**
 * Why somebody is not required to sit this run, in words.
 *
 * Bucket slugs come from the eligibility engine (exam-eligibility-roster.ts).
 * A teacher's override carries their own note when they wrote one, which is
 * always more specific than "Excused by you".
 */
export function excusedLabel(bucket: string | null | undefined, overrideNote: string | null | undefined): string {
  switch (bucket) {
    case 'excused_new_joiner':
      return 'Joined after this class';
    case 'excused_pending_catchup':
      return 'Still catching up';
    case 'teacher_override_excused':
      return overrideNote?.trim() || 'Excused by you';
    default:
      return 'Not required';
  }
}

/**
 * Whether one student belongs in one group.
 *
 * 'not_done' deliberately covers both not_started and missed. A teacher chasing
 * people does not care which side of the deadline they stopped on, and making
 * them tick two tiles to reach one group is how the whole feature gets ignored.
 *
 * 'below_pass' (shown as Not passed) is submitted-and-failed, never "has not
 * passed". Somebody who never sat it has passed === null and belongs in
 * 'not_done'; sweeping them in here would put the same person under two tiles
 * and message them twice. 'below_avg' holds to the same rule.
 *
 * 'excused' is never chased: a student who joined after the class, or whom the
 * teacher excused, appears there and in no group that sends a message.
 */
export function matchesResultFilter(
  row: FilterableRow,
  filter: ResultFilter,
  ctx?: ResultFilterContext,
): boolean {
  switch (filter) {
    case 'did':
      return row.status === 'submitted';
    case 'not_done':
      return row.status === 'not_started' || row.status === 'missed';
    case 'no_reason':
      return (row.status === 'not_started' || row.status === 'missed') && !hasSaidWhy(row);
    case 'excused':
      return row.status === 'excused';
    // Anybody without a sitting whose catch-up is still open. Somebody mid-paper
    // is left out: they are sitting it right now, so there is nothing to chase.
    case 'behind':
      return (
        row.status !== 'submitted' && row.status !== 'in_progress' && row.catchup?.state === 'behind'
      );
    case 'passed':
      return row.passed === true;
    case 'below_pass':
      return row.status === 'submitted' && row.passed === false;
    case 'below_avg': {
      if (row.status !== 'submitted' || !ctx || ctx.average == null) return false;
      const pct = ctx.scoreShown === 'first' ? row.first_percentage : row.best_percentage;
      return pct != null && Number(pct) < ctx.average;
    }
    case 'all':
    default:
      return true;
  }
}

export function countByResultFilter<T extends FilterableRow>(
  rows: T[],
  ctx?: ResultFilterContext,
): Record<ResultFilter, number> {
  const out = {} as Record<ResultFilter, number>;
  for (const filter of RESULT_FILTERS) {
    out[filter] = rows.filter((r) => matchesResultFilter(r, filter, ctx)).length;
  }
  return out;
}

/**
 * Which groups match anybody at all.
 *
 * 'all' always stays. The tiles use this to show an empty group as disabled
 * rather than as a live button that opens onto nobody.
 */
export function visibleResultFilters(counts: Record<ResultFilter, number>): ResultFilter[] {
  return RESULT_FILTERS.filter((f) => f === 'all' || counts[f] > 0);
}
