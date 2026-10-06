/**
 * Where one student stands, as one word a teacher can act on.
 *
 * The register answers "who was in the room". It cannot answer the question a
 * teacher actually has at nine in the evening, which is "who do I ring". Two
 * students with identical rows of X's can be in completely different trouble:
 * one watches every recap and clears every catch-up item, the other has not
 * opened Nexus in a month. This is the rule that separates them.
 *
 * No React, no Supabase, no `Date.now()`. `today` is injected so the whole cohort
 * is judged against one moment, the same discipline inactivity-score.ts and
 * catchup-buckets.ts already use.
 *
 * THREE HONESTY RULES, each learned the hard way somewhere else in this codebase
 * and each pinned by its own test below:
 *
 *  1. An unmeasured class is not an absence. Attendance sync runs on a delegated
 *     Microsoft token, so a class nobody synced looks like the whole roster was
 *     missing. `attendance` is null, never a zeroed object, when nothing in the
 *     range was measured. Same rule as parent-attendance.ts, which returns
 *     `attendanceRate: null` rather than 0.
 *
 *  2. RSVP silence is unrepresentable. nexus_class_rsvp stores only opt-outs and
 *     DELETES the row when somebody opts back in, so "never responded" is not a
 *     fact the database holds. Nothing here may be derived from it.
 *
 *  3. Work blocked on us is not the student's fault. A class with no recording,
 *     or a recap we never published, produces a catch-up item nobody can clear.
 *     `blockedOnUs` is carried separately from `ownOpen` and must never push a
 *     student towards a worse standing. Same reason catchup-buckets.ts tests
 *     `waiting_on_us` before it tests anything about the student.
 */
import { NEW_JOINER_GRACE_DAYS } from './inactivity-score';

export type Standing =
  /** Nothing in the range was measured, so no claim can be made. Not a verdict. */
  | 'not_measured'
  /** Inside the joining grace. Too early to read anything into a thin record. */
  | 'new'
  /** A declared window covers today. Their absences are already explained. */
  | 'away'
  /** The one this screen exists for: missing, work outstanding, and not seen. */
  | 'no_contact'
  /** Missing and behind, but still turning up in Nexus. */
  | 'falling_behind'
  /** Misses live classes, does the work anyway. Fine, just not live. */
  | 'catching_up'
  /** In the room, nothing outstanding. */
  | 'keeping_up';

/** At or above this share of measured classes counts as attending live. */
export const KEEPING_UP_RATE = 75;

/** Not seen in Nexus for this long, with work outstanding, reads as no contact. */
export const NO_CONTACT_DAYS = 21;

/**
 * Below this share of the classes they were EXPECTED at, a student is unlikely
 * to be in the room tomorrow whatever the register says they are entitled to.
 *
 * Lives beside KEEPING_UP_RATE on purpose. Two attendance thresholds in two
 * files is exactly how this codebase ended up with four attendance-percentage
 * implementations, two of which are documented as wrong.
 */
export const RARELY_COMES_RATE = 40;

/** Fewer measured classes than this and the record says nothing worth acting on. */
export const MIN_JUDGED_CLASSES = 4;

export interface TurnoutTally {
  /** Classes measured and counted against them, away days INCLUDED. */
  counted: number;
  present: number;
  /** Of `counted`, the ones a declared window already explained. */
  away: number;
}

export interface TurnoutRecord {
  /** `counted` minus away: the classes they were actually expected at. */
  judged: number;
  /** Null when there is nothing to judge. Never 0, same rule as `rate`. */
  rate: number | null;
  /** Enough history, and below the bar. The only field a forecast may subtract on. */
  rarely: boolean;
}

/**
 * How reliably this student turns up, for predicting a room.
 *
 * DELIBERATELY NOT `StandingRow.rate`, and the difference is the whole point.
 * That rate divides by `counted`, which includes away days, because a rate that
 * dropped them would let anyone declaring open-ended leave read as 100% (see
 * the note at the top of api/timetable/rsvp-dashboard/route.ts).
 *
 * A forecast needs the opposite. It already subtracts a declared window on the
 * specific date it covers, so leaving those same classes in the denominator
 * here would subtract the same absence twice, and a student who declared three
 * weeks of exam leave and has since come back would read as someone who never
 * attends. That punishes the people who told us in advance, which is the harm
 * the `away`-before-`no_contact` ordering below exists to prevent.
 *
 * A retrospective "I was unwell" absence stays in. The question this answers is
 * who is in the room, not who is to blame for being out of it.
 */
export function turnoutRecord(t: TurnoutTally | null | undefined): TurnoutRecord {
  const judged = Math.max(0, (t?.counted ?? 0) - (t?.away ?? 0));
  if (!t || judged <= 0) return { judged: 0, rate: null, rarely: false };
  const rate = Math.round((Math.min(t.present, judged) / judged) * 100);
  return { judged, rate, rarely: judged >= MIN_JUDGED_CLASSES && rate < RARELY_COMES_RATE };
}

/**
 * How much history a student needs before their own record outweighs the room's.
 *
 * DELIBERATELY NOT MIN_JUDGED_CLASSES, and conflating them is the mistake this
 * comment exists to stop. That constant decides whether we say anything about a
 * student at all. This one decides how fast a record earns trust once we do:
 * it is the weight, in classes, of the prior. At 2, a student with 20 judged
 * classes lands within a few points of their own raw rate, so a reliable room
 * still reads 29 of 30 rather than drifting pessimistic, while a student with
 * two classes is still mostly judged by the room around them.
 */
export const SHRINK_ALPHA = 2;

/**
 * The room's rate when the room has no measured history at all.
 *
 * 1, not 0. Honesty rule 1 in reverse: never having looked is not evidence that
 * nobody comes. A brand new classroom predicts everyone present, which is the
 * same thing the forecast did before it could predict anything, and the only
 * claim we are entitled to make.
 */
export const NO_HISTORY_BASE_RATE = 1;

export interface TurnoutProbability {
  /** 0 to 1. The chance this student is in the room on a day they are expected. */
  p: number;
  /** The room's rate, not their own record, is doing most of the work here. */
  thin: boolean;
}

/** The classroom's own attendance rate over the same measured window, 0 to 1. */
export function baseTurnoutRate(tallies: Array<TurnoutTally | null | undefined>): number {
  let present = 0;
  let judged = 0;
  for (const t of tallies) {
    const j = Math.max(0, (t?.counted ?? 0) - (t?.away ?? 0));
    if (j <= 0) continue;
    judged += j;
    present += Math.min(t?.present ?? 0, j);
  }
  return judged > 0 ? present / judged : NO_HISTORY_BASE_RATE;
}

/**
 * The chance one student is in the room, for summing into a forecast.
 *
 * THE CLIFF THIS REPLACES: `rarely` is a step function at RARELY_COMES_RATE, and
 * the forecast subtracted a whole head on the wrong side of it. Two students at
 * 39% and 41% differed by one chair each, so a 2-point difference in a record
 * moved a 30-person class by 23 heads. Teachers read that number every day and
 * it was wrong in the optimistic direction, which is the direction that empties
 * a room nobody planned for.
 *
 * Beta-binomial shrinkage toward the room's own rate. Continuous and monotone,
 * so 41% now costs 0.59 of a head rather than nothing, and no student can move
 * the total by a whole person by crossing a line. A student with no history at
 * all lands exactly on the room's average, because no history is not evidence
 * of absence.
 *
 * `judged` already has declared away days out of the denominator, which is the
 * entire reason turnoutRecord computes it that way, and the reason this can be
 * summed in front of a teacher without misrepresenting anyone who told us in
 * advance. Callers must round the SUM once at the end and never round p here:
 * rounding per student rebuilds the cliff with extra steps.
 */
export function turnoutProbability(
  t: TurnoutTally | null | undefined,
  baseRate: number,
): TurnoutProbability {
  const judged = Math.max(0, (t?.counted ?? 0) - (t?.away ?? 0));
  const present = Math.min(t?.present ?? 0, judged);
  const m = Number.isFinite(baseRate) ? Math.min(1, Math.max(0, baseRate)) : NO_HISTORY_BASE_RATE;
  const p = (present + SHRINK_ALPHA * m) / (judged + SHRINK_ALPHA);
  return { p: Math.min(1, Math.max(0, p)), thin: judged < MIN_JUDGED_CLASSES };
}

export interface StandingInput {
  /** IST YYYY-MM-DD. One value for the whole cohort, never per row. */
  today: string;
  enrolledAt: string | null;
  /**
   * NULL when no class in the range had a single attendance row, for ANY
   * student. Never `{ counted: 0 }`: the difference between "they missed
   * everything" and "we never looked" is the whole of honesty rule 1.
   */
  attendance: {
    counted: number;
    present: number;
    away: number;
    /** Cells whose group is `no_reason`. Missing, with nothing said. */
    unexplainedMissed: number;
  } | null;
  /** A live away window covering today, or null. */
  away: {
    endsOn: string | null;
    reviewOverdue: boolean;
  } | null;
  /**
   * NULL when the catch-up read failed. Not zeroes: a failed read that looked
   * like an empty backlog would report a struggling cohort as all clear.
   */
  catchup: {
    /** Items that are theirs to clear. NEVER includes late-joiner backlog. */
    ownOpen: number;
    /** Items nobody can clear because we have not published the recap. */
    blockedOnUs: number;
  } | null;
  seen: {
    /** ISO, or null if they have never got past the photo gate. */
    lastSeenAt: string | null;
    neverEntered: boolean;
  };
}

export interface StandingResult {
  standing: Standing;
  /** Worst first, the same contract as InactivityResult.reasons. */
  reasons: string[];
  /** What could not be read, rendered as "not measured" rather than as zero. */
  unavailable: string[];
}

function daysSince(iso: string | null, todayYmd: string): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  const now = Date.parse(`${todayYmd}T23:59:59Z`);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  return Math.floor((now - then) / 86_400_000);
}

/**
 * Which standing this student is in.
 *
 * Order is the design, and two placements carry most of the weight.
 *
 * `away` comes before `no_contact`, because declaring a window IS contact. A
 * student who told us they would be gone must never be the one the screen points
 * at, or the feature punishes the people who used it.
 *
 * `no_contact` comes before `falling_behind` for the same reason `not_started`
 * outranks `behind` in catchupBucket: it names something specific and actionable
 * where falling behind only names a trend.
 */
export function attendanceStanding(input: StandingInput): StandingResult {
  const reasons: string[] = [];
  const unavailable: string[] = [];
  if (!input.attendance) unavailable.push('attendance');
  if (!input.catchup) unavailable.push('catch-up');

  // 1. Nothing measured. Every test below is a claim about attendance, and
  //    there is none to make one from.
  if (!input.attendance || input.attendance.counted === 0) {
    return {
      standing: 'not_measured',
      reasons: ['No class in this range has been read from Teams yet'],
      unavailable,
    };
  }

  const { counted, present, away, unexplainedMissed } = input.attendance;
  const rate = Math.round((present / counted) * 100);
  const ownOpen = input.catchup?.ownOpen ?? 0;
  const blockedOnUs = input.catchup?.blockedOnUs ?? 0;
  const sinceSeen = daysSince(input.seen.lastSeenAt, input.today);

  // 2. Too new to read anything into.
  const daysEnrolled = daysSince(input.enrolledAt, input.today);
  if (daysEnrolled !== null && daysEnrolled < NEW_JOINER_GRACE_DAYS) {
    return { standing: 'new', reasons: ['Joined in the last two weeks'], unavailable };
  }

  // 3. Away, and it explains what is missing.
  if (input.away) {
    reasons.push(
      input.away.endsOn ? `Away until ${input.away.endsOn}` : 'Away, no return date given',
    );
    if (input.away.reviewOverdue) {
      // The open-ended safety valve. The window still explains every class it
      // covers, forever: only THIS screen notices that nobody has confirmed it
      // in a month, which is what stops a declared absence quietly becoming
      // permanent invisibility.
      reasons.unshift('Away dates have not been confirmed in a month');
    }
    return { standing: 'away', reasons, unavailable };
  }

  // 4. The sleeper cell. All three have to be true: something unexplained is
  //    missing, work is outstanding, and nobody has seen them.
  const unseen = input.seen.neverEntered || (sinceSeen !== null && sinceSeen >= NO_CONTACT_DAYS);
  if (unexplainedMissed > 0 && ownOpen > 0 && unseen) {
    reasons.push(
      input.seen.neverEntered ? 'Has never opened Nexus' : `Not seen in Nexus for ${sinceSeen} days`,
    );
    reasons.push(`${unexplainedMissed} missed with no reason given`);
    reasons.push(`${ownOpen} still to catch up`);
    return { standing: 'no_contact', reasons, unavailable };
  }

  if (away > 0) reasons.push(`${away} explained by away dates`);
  if (blockedOnUs > 0) reasons.push(`${blockedOnUs} waiting on a recap from us`);

  // 5 and 6. Nothing of theirs outstanding. The rate is what separates the
  //    student who is in the room from the one who is keeping up without being.
  if (ownOpen === 0) {
    if (rate >= KEEPING_UP_RATE) {
      reasons.unshift(`In ${present} of ${counted} classes`);
      return { standing: 'keeping_up', reasons, unavailable };
    }
    reasons.unshift(`Missed live, but has cleared everything`);
    return { standing: 'catching_up', reasons, unavailable };
  }

  // 7. Behind, but still around. Worth a message rather than a phone call.
  reasons.unshift(`${ownOpen} still to catch up`);
  if (unexplainedMissed > 0) reasons.push(`${unexplainedMissed} missed with no reason given`);
  return { standing: 'falling_behind', reasons, unavailable };
}

/**
 * Reading order on the screen, worst first.
 *
 * Deliberately NOT the precedence order above. Precedence answers "which one is
 * this student in"; this answers "who does the teacher need to see first", and
 * `not_measured` belongs at the bottom of a list while being the first thing
 * checked.
 */
export const STANDING_ORDER: Standing[] = [
  'no_contact',
  'falling_behind',
  'catching_up',
  'away',
  'keeping_up',
  'new',
  'not_measured',
];

export interface StandingMeta {
  label: string;
  hint: string;
  tone: 'error' | 'warning' | 'info' | 'success' | 'neutral';
}

export const STANDING_META: Record<Standing, StandingMeta> = {
  no_contact: {
    label: 'No contact',
    hint: 'Missing, nothing caught up, not seen in Nexus',
    tone: 'error',
  },
  falling_behind: {
    label: 'Falling behind',
    hint: 'Work outstanding, but still using Nexus',
    tone: 'warning',
  },
  catching_up: {
    label: 'Catching up',
    hint: 'Misses live classes, does the work anyway',
    tone: 'info',
  },
  away: { label: 'Away', hint: 'Told us in advance', tone: 'neutral' },
  keeping_up: { label: 'Keeping up', hint: 'In the room, nothing outstanding', tone: 'success' },
  new: { label: 'Just joined', hint: 'Too early to say', tone: 'neutral' },
  not_measured: {
    label: 'Not measured',
    hint: 'No attendance has been read for this range',
    tone: 'neutral',
  },
};
