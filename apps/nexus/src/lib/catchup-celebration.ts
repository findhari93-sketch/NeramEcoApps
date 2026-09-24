/**
 * Has this all-clear student already been congratulated?
 *
 * The Teams post on the Standing tab used to name everyone who was clear, every
 * time, and remember none of it. A teacher who had already congratulated two
 * students twice had no way to name only the one who was new. Each
 * congratulation is now a row in `nexus_catchup_celebrations`, and this file is
 * the one rule that reads those rows.
 *
 * A congratulation is for a clean slate, not for a person forever. A student
 * who was congratulated, then missed another class and cleared it, has done it
 * again and is due a new one. That is decided by comparing the standing snapshot
 * taken when they were congratulated with their latest clear now, rather than
 * with the time of the post: a class cleared a minute before the post was
 * already part of what was congratulated.
 */

export type CelebrationState = 'new' | 'congratulated' | 'cleared_again';

/** 'teams' is history (the retired group post); 'auto' the system; 'note' a teacher's note. */
export type CelebrationSource = 'teams' | 'marked' | 'auto' | 'note';

export interface CelebrationRow {
  id: string;
  student_id: string;
  source: CelebrationSource;
  last_cleared_at: string | null;
  celebrated_at: string;
}

export interface CelebrationInfo {
  state: CelebrationState;
  /** When they were last congratulated. */
  lastAt: string;
  source: CelebrationSource;
  /** How many times, across every post and mark in this classroom. */
  count: number;
}

/** One second of slack, so two spellings of the same instant never read as "again". */
const SAME_INSTANT_MS = 1000;

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The state for one student, given their latest clear and their latest
 * congratulation.
 *
 * Timestamps are compared as instants, never as strings: the standing reports
 * `+05:30` and Postgres hands the snapshot back in UTC, and those two spellings
 * of the same moment sort in the wrong order as text.
 */
export function celebrationState(
  lastClearedAt: string | null,
  latest: Pick<CelebrationRow, 'last_cleared_at'> | null,
): CelebrationState {
  if (!latest) return 'new';
  const cleared = toMs(lastClearedAt);
  if (cleared === null) return 'congratulated';
  const snapshot = toMs(latest.last_cleared_at);
  if (snapshot === null) return 'cleared_again';
  return cleared - snapshot > SAME_INSTANT_MS ? 'cleared_again' : 'congratulated';
}

/** The newest row per student, with how many rows they have. Order of input does not matter. */
export function latestCelebrationByStudent(
  rows: CelebrationRow[],
): Map<string, { latest: CelebrationRow; count: number }> {
  const out = new Map<string, { latest: CelebrationRow; count: number }>();
  for (const r of rows) {
    const seen = out.get(r.student_id);
    if (!seen) {
      out.set(r.student_id, { latest: r, count: 1 });
      continue;
    }
    seen.count += 1;
    if ((toMs(r.celebrated_at) ?? 0) > (toMs(seen.latest.celebrated_at) ?? 0)) seen.latest = r;
  }
  return out;
}

/** Everything the wall needs about one student, or null when they have never been congratulated. */
export function celebrationInfo(
  lastClearedAt: string | null,
  entry: { latest: CelebrationRow; count: number } | undefined,
): CelebrationInfo | null {
  if (!entry) return null;
  return {
    state: celebrationState(lastClearedAt, entry.latest),
    lastAt: entry.latest.celebrated_at,
    source: entry.latest.source,
    count: entry.count,
  };
}

/** Due a congratulation: never had one, or cleared another class since the last. */
export function isDueCelebration(info: CelebrationInfo | null | undefined): boolean {
  return !info || info.state !== 'congratulated';
}
