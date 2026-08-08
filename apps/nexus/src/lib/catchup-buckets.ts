/**
 * What is wrong with this student, in one word.
 *
 * This exists because the rule was written twice and the two copies disagreed.
 * The headline tile counted `clock.overdue || pace.state === 'behind'`, while the
 * red list underneath it counted `clock.overdue || clock.stalled || pace.state
 * === 'behind'`. Since almost every student is in the stalled state, the number
 * on the tile and the length of the list below it did not match, and a teacher
 * counting rows to check the number found a different answer.
 *
 * So there is one function now. The route classifies each student with it and
 * returns both the per-student bucket and the tally, and the page renders its
 * tiles from that tally and its groups from that bucket. They are the same
 * numbers by construction, not by agreement.
 */

/** Mutually exclusive and total: every student the screen shows has exactly one. */
export type CatchupBucket =
  | 'waiting_on_us'
  | 'run_over'
  | 'not_started'
  | 'behind'
  | 'in_progress'
  /** Nothing outstanding and nothing blocked. The only bucket that is good news. */
  | 'all_clear';

export interface BucketInput {
  /** Work the student can actually act on. Excludes anything blocked on us. */
  openCount: number;
  /**
   * Items sitting at `blocked` or `pending_teacher`: no recording at all, or a
   * recap nobody has published. The student cannot move these, we can.
   */
  blockedOnUs: number;
  clock: { active: boolean; overdue: boolean; stalled: boolean };
  pace: { state: 'on_track' | 'behind' | 'done' };
}

/**
 * Classify one student. Order matters and is not the display order.
 *
 * `all_clear` is tested before everything because it is the only total claim on
 * the list: it says there is no work at all, where every test below it is a
 * statement about work that exists. It was missing entirely until now, and its
 * absence is why the route dropped anyone who had finished before the page could
 * see them, so the one group a teacher would want to celebrate was the single
 * group the screen deleted.
 *
 * `waiting_on_us` is tested next because it is a claim about us, not them. A
 * student whose every outstanding class is stuck behind an unpublished recap has
 * done nothing wrong, and nudging them is worse than useless. They used to be
 * scattered through the chase list; before that they were not on this screen at
 * all, because blocked items never reach the pace denominator and the route
 * dropped anyone whose open count was zero.
 *
 * After that it is most-urgent first. `not_started` outranks `behind` because it
 * says something specific and actionable ("they have never opened this") where
 * behind-pace is a trend, and because with one clock at a time a stalled student
 * is the single most common thing on the screen.
 */
export function catchupBucket(row: BucketInput): CatchupBucket {
  if (row.openCount === 0 && row.blockedOnUs === 0) return 'all_clear';
  if (row.openCount === 0 && row.blockedOnUs > 0) return 'waiting_on_us';
  if (row.clock.overdue) return 'run_over';
  if (row.clock.stalled) return 'not_started';
  if (row.pace.state === 'behind') return 'behind';
  // Everything left has a clock running on it and is keeping up.
  return 'in_progress';
}

/**
 * Display order, which is deliberately NOT the classification order above.
 *
 * `waiting_on_us` classifies first and renders last: it is the one group a
 * teacher cannot fix by calling anybody, so it belongs at the bottom, out of the
 * way of the work they can actually do.
 */
export const BUCKET_ORDER: CatchupBucket[] = [
  'run_over',
  'not_started',
  'behind',
  'in_progress',
  'waiting_on_us',
];

/**
 * Every bucket that exists, which is deliberately NOT `BUCKET_ORDER`.
 *
 * `all_clear` is missing from the order above on purpose, and that omission is
 * load-bearing rather than an oversight: the needs-action list builds its groups
 * by iterating `BUCKET_ORDER`, so leaving finished students out of it is what
 * keeps them off a chase screen without a single `if` anywhere in the UI.
 *
 * Use this list, not the order, for anything that must cover the whole type:
 * tallies, metadata, exhaustiveness checks.
 */
export const ALL_BUCKETS: CatchupBucket[] = [...BUCKET_ORDER, 'all_clear'];

export interface BucketMeta {
  /** The group heading. Sentence case, because it is read as a phrase. */
  label: string;
  /** One line under the heading saying what the group means. */
  hint: string;
  tone: 'bad' | 'warn' | 'idle' | 'good';
  /** False where a nudge would be dishonest, which hides the bulk action. */
  nudgeable: boolean;
}

export const BUCKET_META: Record<CatchupBucket, BucketMeta> = {
  run_over: {
    label: 'Run over',
    hint: 'They started a class and the time ran out.',
    tone: 'bad',
    nudgeable: true,
  },
  not_started: {
    label: 'Not started',
    hint: 'Work is waiting and they have not opened any of it, so no clock is running.',
    tone: 'warn',
    nudgeable: true,
  },
  behind: {
    label: 'Behind pace',
    hint: 'Working through it, but slower than their weekly quota.',
    tone: 'warn',
    nudgeable: true,
  },
  in_progress: {
    label: 'In progress',
    hint: 'A clock is running and they are keeping up. Nothing to do.',
    tone: 'idle',
    nudgeable: false,
  },
  waiting_on_us: {
    label: 'Waiting on us',
    hint: 'Stuck behind a missing recording or an unpublished recap. Publish it to unblock them.',
    tone: 'idle',
    nudgeable: false,
  },
  all_clear: {
    label: 'All clear',
    hint: 'Nothing left to catch up on. Worth saying so out loud.',
    tone: 'good',
    nudgeable: false,
  },
};

export type BucketTally = Record<CatchupBucket, number>;

export function emptyTally(): BucketTally {
  return {
    run_over: 0,
    not_started: 0,
    behind: 0,
    in_progress: 0,
    waiting_on_us: 0,
    all_clear: 0,
  };
}

/** Tally a classified cohort. The tiles read this, so it cannot drift from the list. */
export function tallyBuckets(buckets: CatchupBucket[]): BucketTally {
  const tally = emptyTally();
  for (const b of buckets) tally[b] += 1;
  return tally;
}
