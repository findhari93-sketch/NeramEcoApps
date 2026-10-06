/**
 * Consecutive classes a student missed while saying nothing anywhere.
 *
 * A "silent miss" is a (class, student) cell whose registerGroupOf verdict is
 * `no_reason`: not attended, not joined later, no away window covering the
 * date, no reason typed on the absence afterwards, no RSVP decline, not
 * excused. A "silent streak" is a run of those ending at the most recent
 * measured class the student was on roll for.
 *
 * THE STREAK IS NEVER STORED. Attendance and reasons both move backwards in
 * time: a teacher marks somebody present by hand the next morning, a student
 * files a reason three days later, a Teams sync lands a week late. A stored
 * counter is a cache that goes stale in the one direction that hurts a student,
 * so what gets written down is the DECISION and the MESSAGES SENT, never the
 * count. The watchlist keeps the same discipline for its own score.
 *
 * DELIBERATELY NOT a field on recent-attendance.ts. `countRecent` answers "how
 * has this student been doing lately" for the class a teacher has open, keyed
 * to that class's date, which may be three weeks ago. A streak needs both an
 * order and a terminal position: it has to end at the latest measured class or
 * it is not a streak, it is a historical run. Returning one from a function
 * whose window floats would eventually restrict somebody over a run they ended
 * in September.
 *
 * PURE. No Supabase, no React, no Date.now(). `today` is injected, every date
 * is a YYYY-MM-DD string, and the verdict comes from registerGroupOf rather
 * than being re-derived, so the precedence ladder is inherited rather than
 * copied. That matters more here than anywhere: this module is the input to a
 * rule that can lock a student out of the app, and the one thing it must never
 * do is disagree with the register a teacher is looking at.
 */

import { registerGroupOf, type RegisterGroup } from './attendance-register';
import { joinedAfterClass } from './attendance-quality';
import { daysBetweenYmd } from './away-windows';

/** Classes read back per student. Wider than the streak so a break is visible. */
export const STREAK_LOOKBACK = 8;

/** Consecutive silent misses that put a hold within reach. */
export const RESTRICT_AT = 3;

/**
 * A streak spanning longer than this cannot arm a restriction.
 *
 * Unmeasured classes are transparent (see below), which is right, but it has a
 * price: if the Teams sync is dark for a fortnight, three "consecutive" classes
 * can be a month apart. "Three classes in a row" then stops describing what a
 * teacher or a parent would recognise. Such a streak still shows on the
 * tracker, flagged with its span, so a human can look. It just cannot fire.
 */
export const STREAK_MAX_SPAN_DAYS = 21;

export interface StreakClass {
  id: string;
  scheduled_date: string;
  title: string | null;
}

/** Why the run ended. `none` means the lookback ran out, not that it is clean. */
export type StreakBreaker =
  | 'attended'
  | 'reason'
  | 'away'
  | 'excused'
  | 'joined_later'
  | 'none';

export interface SilentStreak {
  streak: number;
  /**
   * The exact classes the streak is made of, newest first.
   *
   * Carried rather than counted because both sides have to see them. The
   * blocker names them so a student can answer each one, and the tracker names
   * them so a teacher is never asking anybody to take our word for it.
   */
  classes: StreakClass[];
  /** Calendar days from the oldest class in the streak to the newest. */
  spanDays: number;
  /** Measured classes in the lookback this student was on roll for. */
  judged: number;
  brokenBy: StreakBreaker;
}

export const EMPTY_STREAK: SilentStreak = {
  streak: 0,
  classes: [],
  spanDays: 0,
  judged: 0,
  brokenBy: 'none',
};

export interface SilentStreakInput {
  /** Measured, taught, non-cancelled classes, NEWEST FIRST. */
  classes: StreakClass[];
  studentIds: string[];
  enrolledAt: Map<string, string | null>;
  /** `${classId}:${studentId}` for everyone who attended. */
  attended: Set<string>;
  /** Classes marked "no class was taught". Not classes at all. */
  notTaught: Set<string>;
  /** `${classId}:${studentId}` a teacher excused. Outranks everything. */
  excused: Set<string>;
  /** `${classId}:${studentId}` a live away window covers. */
  away: Set<string>;
  /** `${classId}:${studentId}` with a reason from any of the three sources. */
  explained: Set<string>;
}

const key = (classId: string, studentId: string) => `${classId}:${studentId}`;

/**
 * Classes that are not evidence of anything, however the sync flag reads.
 *
 * `attendance_synced_at` being set is NOT proof the sync worked: a run that
 * returns zero rows stamps it just the same, and the absence derivation then
 * writes the entire roster as a no-show. Three such classes would hold a whole
 * classroom for a failure that was ours. So a class where literally nobody is
 * recorded as present is treated exactly like an unmeasured one: skipped, not
 * counted, not a breaker.
 *
 * The false negative is a real class that genuinely nobody attended. That is a
 * class the teacher already knows about, and it should have been cancelled.
 * Letting one of those slip is cheap; locking out a room is not.
 */
export function classesWithNobodyPresent(input: {
  classes: StreakClass[];
  attended: Set<string>;
}): Set<string> {
  const seen = new Set<string>();
  for (const k of input.attended) {
    const classId = k.slice(0, k.indexOf(':'));
    if (classId) seen.add(classId);
  }
  const empty = new Set<string>();
  for (const c of input.classes) if (!seen.has(c.id)) empty.add(c.id);
  return empty;
}

function breakerOf(group: RegisterGroup, excused: boolean): StreakBreaker {
  if (group === 'whole' || group === 'partly') return 'attended';
  if (excused) return 'excused';
  if (group === 'away') return 'away';
  if (group === 'joined_later') return 'joined_later';
  return 'reason';
}

/**
 * One streak per student, counting back from the most recent class.
 *
 * Every exclusion below is an honesty rule, not an optimisation:
 *
 *   A class nobody taught is not a class.
 *   A class that ran before they enrolled was never theirs to miss.
 *   A class nobody is recorded present at is our failure, not theirs.
 *
 * An unmeasured class is TRANSPARENT: neither counted nor a breaker. Making it
 * a breaker would mean a student escapes the rule because we failed to read
 * Teams, which rewards our own failure. Making it a continuation is the
 * lock-out-the-whole-class disaster and is not an option. The caller filters
 * unsynced classes out of `classes` entirely, which is what makes this true,
 * and STREAK_MAX_SPAN_DAYS is the guard against transparency stretching a run
 * across a month of blindness.
 */
export function countSilentStreaks(input: SilentStreakInput): Map<string, SilentStreak> {
  const out = new Map<string, SilentStreak>();
  const noneHere = classesWithNobodyPresent(input);

  for (const sid of input.studentIds) {
    const classes: StreakClass[] = [];
    let judged = 0;
    let brokenBy: StreakBreaker = 'none';
    let running = true;

    for (const c of input.classes) {
      if (input.notTaught.has(c.id)) continue;
      if (noneHere.has(c.id)) continue;
      if (joinedAfterClass(input.enrolledAt.get(sid) ?? null, c.scheduled_date)) continue;

      judged += 1;
      if (!running) continue;

      const k = key(c.id, sid);
      const excused = input.excused.has(k);
      const group = registerGroupOf({
        attended: input.attended.has(k),
        away: input.away.has(k),
        absence: {
          // The three-source resolver has already decided this, so only the
          // answer travels here. Passing a reason_code we had not resolved
          // would let this module and the register disagree about one cell.
          reason_note: input.explained.has(k) ? 'resolved' : null,
          excused_at: excused ? 'resolved' : null,
        },
      });

      if (group === 'no_reason') {
        classes.push(c);
      } else {
        brokenBy = breakerOf(group, excused);
        running = false;
      }
    }

    const newest = classes[0]?.scheduled_date;
    const oldest = classes[classes.length - 1]?.scheduled_date;
    out.set(sid, {
      streak: classes.length,
      classes,
      spanDays: newest && oldest ? daysBetweenYmd(oldest, newest) : 0,
      judged,
      brokenBy,
    });
  }

  return out;
}

/**
 * Is this streak long enough, and tight enough, to be acted on at all?
 *
 * Deliberately NOT the whole arming rule. A restriction additionally requires
 * that every class in the streak was asked about and that the message was seen,
 * which needs the nudge log and therefore the database. This is only the half
 * that can be decided from attendance, and keeping it separate is what lets the
 * tracker say "3 silent misses, 3 messages sent, none opened" rather than
 * silently showing nothing.
 */
export function streakIsActionable(s: SilentStreak): boolean {
  if (s.streak < RESTRICT_AT) return false;
  return s.spanDays <= STREAK_MAX_SPAN_DAYS;
}
