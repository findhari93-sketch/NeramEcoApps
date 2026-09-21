/**
 * How many students will actually be in the room, as opposed to how many are
 * entitled to be.
 *
 * The server already answers the first three lines of this sum: who is on the
 * roll for a date, who declared a window covering it, and who stepped out of
 * that day's class. What it cannot answer is the founder's real question, which
 * is about the students who said nothing at all:
 *
 *     "out of 20 also those students were very improper who are very less
 *      percentage, they may also not be attending the class"
 *
 *       30   on roll        enrolled by this date, in the day's batch union
 *      - 9   away           a declared window covers it          (reason known)
 *      - 1   stepped out    opted out of this day's class        (reason known)
 *     ----
 *      = 20   expected      exactly summary.attending, untouched
 *      - 4   rarely come    of those 20, the record says otherwise
 *     ----
 *      ~ 16   likely        the number on the calendar
 *
 * PURE. No React, no fetch, no Date.now(). `today` is injected so a whole month
 * is judged against one moment, the same discipline attendance-standing.ts and
 * away-windows.ts already keep.
 *
 * THE TRAP THIS MODULE EXISTS TO AVOID is subtracting the same person twice.
 * Away and stepped-out have already left `expected`. A student on exam leave
 * whose attendance record is also thin must not be taken off again, or a class
 * where the whole batch declared leave reads as negative turnout. Every
 * exclusion below is there for that reason, and `likely` is clamped as a last
 * line of defence rather than as arithmetic anyone should rely on.
 */
import type { RsvpDaySummary, RsvpClassSummary } from '@/app/api/timetable/rsvp-dashboard/route';
import { turnoutRecord, type TurnoutRecord } from './attendance-standing';
import { joinedAfterClass } from './attendance-quality';
import { NEW_JOINER_GRACE_DAYS } from './inactivity-score';

/**
 * The slice of /api/attendance/standing this module needs.
 *
 * Structural, not the imported StandingRow, so a test can build one in three
 * lines and so this module never depends on a route's full response shape.
 */
export interface ForecastStudent {
  id: string;
  name: string;
  avatar_url: string | null;
  batch_id: string | null;
  enrolled_at: string | null;
  present: number;
  counted: number;
  away: number;
  standing: string;
}

export interface RarelyComes {
  id: string;
  name: string;
  avatar_url: string | null;
  /** Their record over the measured window, away days already excluded. */
  record: TurnoutRecord;
}

export interface DayForecast {
  date: string;
  /** summary.attending, restated so callers never have to reach past this. */
  expected: number;
  onRoll: number;
  away: number;
  declined: number;
  /** Expected students whose record says they will not be there. */
  atRisk: number;
  /** expected minus atRisk, never below zero. */
  likely: number;
  /**
   * Whether `likely` is a prediction rather than a restatement of `expected`.
   *
   * False when nothing was discounted, and false when the roll could not be
   * verified. The tilde on the calendar is driven by this and nothing else: a
   * count with no estimate in it must not be dressed up as one.
   */
  estimated: boolean;
  /** Recent joiners on the roll that date. Never discounted, always named. */
  newcomers: string[];
  scheduled: boolean;
}

/**
 * Which batches a date's classes invite, or null for the whole classroom.
 *
 * A literal transcription of the server's own rule, which is why it tests
 * `!batch_id` rather than `=== null`: a class with no batch is a class the
 * whole room was called to, and one such class on a day opens the day to
 * everyone however many batch-specific classes sit beside it.
 */
export function dayBatchIds(
  day: Pick<RsvpDaySummary, 'class_ids'>,
  classesById: Map<string, Pick<RsvpClassSummary, 'batch_id'>>,
): Set<string> | null {
  if (day.class_ids.length === 0) return null;
  const ids: string[] = [];
  for (const id of day.class_ids) {
    const cls = classesById.get(id);
    // An id we cannot resolve is not evidence of a batch. Treating it as a
    // whole-classroom class is the safe read: it widens the roll rather than
    // silently shrinking it.
    if (!cls || !cls.batch_id) return null;
    ids.push(cls.batch_id);
  }
  return new Set(ids);
}

/** Enrolled by this date, and invited to it. */
function onRollFor(s: ForecastStudent, date: string, batchIds: Set<string> | null): boolean {
  if (batchIds && !batchIds.has(s.batch_id ?? '')) return false;
  return !joinedAfterClass(s.enrolled_at, date);
}

function daysSince(iso: string | null, todayYmd: string): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  const now = Date.parse(`${todayYmd}T23:59:59+05:30`);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  return Math.floor((now - then) / 86_400_000);
}

/** Inside the joining grace, so their thin record means nothing yet. */
export function isNewcomer(s: ForecastStudent, today: string): boolean {
  if (s.standing === 'new') return true;
  const enrolled = daysSince(s.enrolled_at, today);
  return enrolled !== null && enrolled < NEW_JOINER_GRACE_DAYS;
}

export interface ForecastInput {
  days: RsvpDaySummary[];
  classes: Pick<RsvpClassSummary, 'class_id' | 'batch_id'>[];
  /** Null or empty when standing is unavailable. The forecast then degrades. */
  students: ForecastStudent[] | null | undefined;
  today: string;
}

/**
 * One forecast per date.
 *
 * Degrades rather than guesses. With no standing data every row still comes
 * back, with `likely === expected` and `estimated` false, so the calendar keeps
 * working and simply stops offering an opinion. A forecast that rendered
 * "~0 of 30" because a fetch failed would be worse than no forecast.
 */
export function buildForecast(input: ForecastInput): Map<string, DayForecast> {
  const { days, classes, students, today } = input;

  const classesById = new Map(classes.map((c) => [c.class_id, c] as const));
  const roster = students || [];

  // Computed once: the record does not change from one date to the next, only
  // whether it applies to that date.
  const recordById = new Map<string, TurnoutRecord>();
  const rarely = new Set<string>();
  for (const s of roster) {
    const record = turnoutRecord(s);
    recordById.set(s.id, record);
    if (record.rarely && !isNewcomer(s, today)) rarely.add(s.id);
  }

  const out = new Map<string, DayForecast>();

  for (const day of days) {
    const batchIds = dayBatchIds(day, classesById);
    const expected = day.summary.attending;

    // Can this roster answer for this date at all? Two independently fetched
    // rosters can disagree: a student enrolled, removed or paused between the
    // two requests, or a classroom switch serving one stale payload. Rather
    // than reconcile them, check the one number both sides already state and
    // fall back to the server's figure when they differ. The failure mode is
    // the behaviour that shipped before this feature, which is correct, just
    // less informative.
    const computedOnRoll = roster.filter((s) => onRollFor(s, day.date, batchIds)).length;
    const trustworthy = roster.length > 0 && computedOnRoll === day.summary.on_roll;

    let atRisk = 0;
    const newcomers: string[] = [];

    if (trustworthy) {
      const excluded = new Set([...day.away_ids, ...day.declined_ids]);
      for (const s of roster) {
        if (!onRollFor(s, day.date, batchIds)) continue;
        // Already subtracted upstream. Counting them again would take the same
        // empty chair off the roll twice.
        if (excluded.has(s.id)) continue;
        if (isNewcomer(s, today)) {
          newcomers.push(s.id);
          continue;
        }
        if (rarely.has(s.id)) atRisk += 1;
      }
    }

    const likely = Math.max(0, expected - atRisk);

    out.set(day.date, {
      date: day.date,
      expected,
      onRoll: day.summary.on_roll,
      away: day.summary.away,
      declined: day.summary.not_attending,
      atRisk,
      likely,
      estimated: trustworthy && atRisk > 0,
      newcomers,
      scheduled: day.class_ids.length > 0,
    });
  }

  return out;
}

/**
 * The students behind a day's `atRisk`, worst record first, for the sheet.
 *
 * Recomputed from the same predicates rather than carried on DayForecast, which
 * keeps the per-date map small enough to hold a whole month grid.
 */
export function rarelyComingOn(
  day: RsvpDaySummary,
  classes: Pick<RsvpClassSummary, 'class_id' | 'batch_id'>[],
  students: ForecastStudent[] | null | undefined,
  today: string,
): RarelyComes[] {
  const batchIds = dayBatchIds(day, new Map(classes.map((c) => [c.class_id, c] as const)));
  const excluded = new Set([...day.away_ids, ...day.declined_ids]);

  return (students || [])
    .filter((s) => onRollFor(s, day.date, batchIds) && !excluded.has(s.id) && !isNewcomer(s, today))
    .map((s) => ({ id: s.id, name: s.name, avatar_url: s.avatar_url, record: turnoutRecord(s) }))
    .filter((r) => r.record.rarely)
    .sort((a, b) => (a.record.rate ?? 0) - (b.record.rate ?? 0) || a.name.localeCompare(b.name));
}

/** The newcomers on the roll for a date, for the `New` tag in the sheet. */
export function newcomersOn(
  day: RsvpDaySummary,
  classes: Pick<RsvpClassSummary, 'class_id' | 'batch_id'>[],
  students: ForecastStudent[] | null | undefined,
  today: string,
): ForecastStudent[] {
  const batchIds = dayBatchIds(day, new Map(classes.map((c) => [c.class_id, c] as const)));
  const excluded = new Set([...day.away_ids, ...day.declined_ids]);
  return (students || [])
    .filter((s) => onRollFor(s, day.date, batchIds) && !excluded.has(s.id) && isNewcomer(s, today))
    .sort((a, b) => a.name.localeCompare(b.name));
}
