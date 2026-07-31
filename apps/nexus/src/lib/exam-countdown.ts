/**
 * How long until the exam, and how honest we are about not knowing.
 *
 * Pure. No React, no Supabase, no next/*. Imported by server routes AND by
 * 'use client' components, which is why the row-fetching lives next door in
 * exam-countdown-server.ts and every decision lives here.
 *
 * TWO RULES DRIVE THIS WHOLE FILE:
 *
 * 1. One ladder, one number. Three tables claim to know a student's exam date
 *    (see 20260804090000_exam_target_and_date_confidence.sql). pickCountdownTarget
 *    is the only place that chooses between them, so the student dashboard, the
 *    parent card and the teacher tile can never show different numbers and
 *    nobody has to argue about which one is real.
 *
 * 2. Granularity scales with distance, hedging scales with confidence. At 174
 *    days out, day-level precision is noise; on a date nobody has announced, it
 *    is a lie. So a far-away date reads "about 6 months to go" and an unconfirmed
 *    date inside a week stops counting altogether and asks staff to confirm it.
 *    "About 3 days to go" on a guess is not honesty, it is precision theatre.
 *
 * The server sends only the date; the client derives the days. A count computed
 * at request time is stale the moment a tab crosses midnight IST, and shipping
 * both a date and a count invites them to disagree. Same split as
 * applyClassPrepGate: the server decides facts, the client decides presentation.
 */

import { istToday } from './plan-flow';

// ---------------------------------------------------------------------------
// Vocabulary. One set of labels for the countdown, the exam-date manager and
// the course-plan dialog, so the same row never reads three different ways.
// ---------------------------------------------------------------------------

export const EXAM_TYPE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee: 'JEE',
  foundation: 'Foundation',
  custom: 'Course',
};

export const PHASE_LABELS: Record<string, string> = {
  phase_1: 'Phase 1',
  phase_2: 'Phase 2',
  session_1: 'Session 1',
  session_2: 'Session 2',
};

export const PHASE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  nata: [
    { value: 'phase_1', label: 'Phase 1' },
    { value: 'phase_2', label: 'Phase 2' },
  ],
  jee: [
    { value: 'session_1', label: 'Session 1' },
    { value: 'session_2', label: 'Session 2' },
  ],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Where the date came from. Ordered by authority, highest first. */
export type ExamCountdownSource = 'student_attempt' | 'exam_registry' | 'plan_manual';

export type ExamCountdownConfidence = 'expected' | 'confirmed';

/**
 * The wire shape. Delivered as `examCountdown: ExamCountdownTarget | null` by
 * /api/dashboard/student, /api/dashboard/teacher and /api/parent/overview.
 *
 * No day count here, on purpose. See the file header.
 */
export interface ExamCountdownTarget {
  /** YYYY-MM-DD. Never null: a missing target is the whole object being null. */
  exam_date: string;
  confidence: ExamCountdownConfidence;
  source: ExamCountdownSource;
  /** jee | nata | foundation | custom. From the registry row, else the plan. */
  exam_type: string;
  /** session_1 | phase_1 | ... Null for plan_manual, since a plan has no phase. */
  phase: string | null;
  /** Calendar year of the exam. Used for label building and attempt matching. */
  exam_year: number;
  /** Full staff-authored label, e.g. "JEE Main 2027 Session 1, Paper 2A (B.Arch)". */
  label: string | null;
  /** nexus_exam_dates.date_note, shown verbatim under an expected date. */
  note: string | null;
  /** Which season this number belongs to, so a two-plan classroom is unambiguous. */
  plan: { id: string; title: string } | null;
  /** True when this is the viewer's OWN slot rather than the cohort's. */
  is_personal: boolean;
  /**
   * The plan's start_date, so the hero can show how much of the preparation
   * window has already gone. Null when there is no plan window to measure
   * against, which simply hides the bar rather than guessing a start.
   */
  prep_started_on: string | null;
}

export type ExamCountdownBand =
  | 'far'
  | 'weeks'
  | 'days'
  | 'final_week'
  | 'tomorrow'
  | 'today'
  | 'past'
  | 'unconfirmed_near';

export type ExamCountdownTone = 'neutral' | 'info' | 'warning' | 'urgent';

/** The rendered view. Produced client-side; never crosses the wire. */
export interface ExamCountdownView {
  days_left: number;
  band: ExamCountdownBand;
  tone: ExamCountdownTone;
  /** Short, for a StatCard value or the parent Metric. "About 6 months", "12 days". */
  value: string;
  /** Full sentence, for the student strip. "About 6 months to go". */
  headline: string;
  /** Supporting line: the date, and how sure we are of it. */
  detail: string;
  /** Short chip text, or null when a chip would be noise. */
  chip: string | null;
  /** "JEE Session 1". Composed from the label maps, never parsed out of `label`. */
  short_label: string;
  /** True when the value must be visually demoted (parent Metric `muted`). */
  is_estimate: boolean;
  note: string | null;
  /** False once the exam is more than a week past: hide the surface entirely. */
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Row shapes accepted by the ladder. Deliberately structural rather than
// imported from @neram/database: nexus_teaching_plans is not in the generated
// types, and keeping these local means the resolver is testable with plain
// objects and no Supabase mock.
// ---------------------------------------------------------------------------

export interface CountdownExamRow {
  id: string;
  exam_type: string;
  year: number;
  phase: string;
  exam_date: string;
  label: string | null;
  is_active: boolean | null;
  date_confidence: string | null;
  date_note: string | null;
}

export interface CountdownPlanRow {
  id: string;
  title: string;
  exam_type: string;
  status: string;
  start_date: string;
  expected_end_date: string;
  exam_date: string | null;
  target_exam_date_id: string | null;
  created_at?: string | null;
  /** The embedded nexus_exam_dates row, when target_exam_date_id is set. */
  target?: CountdownExamRow | null;
}

export interface CountdownAttemptRow {
  student_id: string;
  exam_type: string;
  phase: string;
  exam_date: string | null;
  exam_date_id: string | null;
  deleted_at?: string | null;
}

// ---------------------------------------------------------------------------
// Day math. UTC-midnight epochs for whole-day arithmetic, the same technique as
// catchup-pace.ts and plan-flow.ts.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function dayEpoch(ymd: string): number {
  return Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);
}

/**
 * Whole days from `from` to `target`. Positive means the target is in the future.
 *
 * Both arguments are IST calendar dates (YYYY-MM-DD), so this is immune to the
 * two off-by-one traps live elsewhere in the repo: toISOString() slicing (a day
 * behind between 00:00 and 05:30 IST) and setHours(0,0,0,0) (browser-local
 * midnight, wrong on a phone set to any non-IST zone).
 */
export function daysUntil(target: string, from: string = istToday()): number {
  return Math.round((dayEpoch(target) - dayEpoch(from)) / DAY_MS);
}

/**
 * The IST calendar date of an arbitrary instant, as YYYY-MM-DD.
 *
 * istToday() reads the clock itself, which is right for server code but useless
 * to a component that wants its ticking clock to drive the output. Passing
 * istDayOf(now) makes that dependency explicit instead of relying on the render
 * happening to call istToday() again.
 */
export function istDayOf(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

// ---------------------------------------------------------------------------
// The resolution ladder
// ---------------------------------------------------------------------------

/**
 * Statuses a countdown may resolve from, most authoritative first.
 *
 * A published plan always wins. A `draft` still counts, because publishing a
 * teaching plan releases a *schedule*; it says nothing about when the exam is.
 * plan-shape-query.ts already draws the student timetable from draft plans for
 * exactly this reason, so treating draft as dead here was the outlier.
 *
 * It was also a live bug: the only plan in production is a draft, so requiring
 * 'active' hid the countdown from the whole cohort, which is the group that most
 * needs the clock. `completed` and `archived` stay excluded: a finished season
 * must not keep counting down to an exam that has already been written.
 */
const PLAN_STATUS_TIERS = ['active', 'draft'] as const;

/**
 * Choose the one plan whose countdown we show.
 *
 * Overlapping active plans are legal (20260723130000_plan_owns_season allows it
 * during a changeover week), so this is a real case and not defensive coding.
 * Within a tier: prefer the plan whose window contains today, then the latest
 * start, then the most recently created.
 */
function pickPlan(plans: CountdownPlanRow[], today: string): CountdownPlanRow | null {
  for (const status of PLAN_STATUS_TIERS) {
    const tier = plans.filter((p) => p.status === status);
    if (tier.length === 0) continue;
    if (tier.length === 1) return tier[0];

    const current = tier.filter((p) => p.start_date <= today && today <= p.expected_end_date);
    const pool = current.length > 0 ? current : tier;

    return [...pool].sort((a, b) => {
      if (a.start_date !== b.start_date) return b.start_date.localeCompare(a.start_date);
      return (b.created_at || '').localeCompare(a.created_at || '');
    })[0];
  }
  return null;
}

function normaliseConfidence(raw: string | null | undefined): ExamCountdownConfidence {
  return raw === 'expected' ? 'expected' : 'confirmed';
}

/**
 * Resolve the single date this viewer should count down to, or null.
 *
 * `viewerStudentId` is the student whose personal slot may override the cohort
 * date: the student themselves, or the child a parent is looking at. Pass null
 * for teachers, who see the cohort date and nothing else.
 */
export function pickCountdownTarget(
  rows: { plans: CountdownPlanRow[]; attempts: CountdownAttemptRow[] },
  opts: { viewerStudentId: string | null; today?: string },
): ExamCountdownTarget | null {
  const today = opts.today ?? istToday();
  const plan = pickPlan(rows.plans || [], today);
  if (!plan) return null;

  const planRef = { id: plan.id, title: plan.title };

  // Rung 1: the cohort's registry row. A soft delete (is_active = false) leaves
  // the plan's pointer intact, so the row's own flag has to be checked here.
  const registry =
    plan.target_exam_date_id && plan.target && plan.target.is_active !== false ? plan.target : null;

  // The year an attempt must match. nexus_student_exam_attempts has no `year`
  // column, so without this guard a student's leftover NATA 2026 attempt would
  // hijack a JEE 2027 countdown.
  const examYear = registry
    ? registry.year
    : plan.exam_date
      ? Number(plan.exam_date.slice(0, 4))
      : null;

  // Rung 2: the viewer's own slot. Wins unconditionally, including when it is
  // past and the cohort date is not: that is the point of a personal clock, and
  // it mirrors the philosophy in packages/database/src/utils/assignment-clock.ts.
  // A no-op for JEE, where everyone sits the same day. The difference between
  // right and wrong for NATA, where the candidate picks a slot.
  if (opts.viewerStudentId) {
    const own = (rows.attempts || []).find((a) => {
      if (a.student_id !== opts.viewerStudentId) return false;
      if (a.deleted_at) return false;
      if (!a.exam_date) return false;
      if (registry) {
        if (a.exam_type !== registry.exam_type) return false;
        if (a.exam_date_id && a.exam_date_id === registry.id) return true;
        if (a.phase !== registry.phase) return false;
        return Number(a.exam_date.slice(0, 4)) === registry.year;
      }
      if (a.exam_type !== plan.exam_type) return false;
      return examYear === null || Number(a.exam_date.slice(0, 4)) === examYear;
    });

    if (own && own.exam_date) {
      return {
        exam_date: own.exam_date,
        confidence: 'confirmed',
        source: 'student_attempt',
        exam_type: own.exam_type,
        phase: own.phase,
        exam_year: Number(own.exam_date.slice(0, 4)),
        label: registry?.label ?? null,
        note: null,
        plan: planRef,
        is_personal: true,
        prep_started_on: plan.start_date ?? null,
      };
    }
  }

  // Rung 3: the registry row.
  if (registry) {
    return {
      exam_date: registry.exam_date,
      confidence: normaliseConfidence(registry.date_confidence),
      source: 'exam_registry',
      exam_type: registry.exam_type,
      phase: registry.phase,
      exam_year: registry.year,
      label: registry.label,
      note: registry.date_note ?? null,
      plan: planRef,
      is_personal: false,
      prep_started_on: plan.start_date ?? null,
    };
  }

  // Rung 4: the plan's own date. Always unconfirmed, because nothing records who
  // typed it or how sure they were. This rung exists for foundation and custom
  // plans, which have no row in a registry of national exams.
  if (plan.exam_date) {
    return {
      exam_date: plan.exam_date,
      confidence: 'expected',
      source: 'plan_manual',
      exam_type: plan.exam_type,
      phase: null,
      exam_year: Number(plan.exam_date.slice(0, 4)),
      label: null,
      note: null,
      plan: planRef,
      is_personal: false,
      prep_started_on: plan.start_date ?? null,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatIstDate(ymd: string, withYear: boolean): string {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
  }).formatToParts(new Date(`${ymd}T12:00:00+05:30`));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const head = `${get('weekday')}, ${get('day')} ${get('month')}`;
  return withYear ? `${head} ${get('year')}` : head;
}

/** "20 Jan 2027", for the softer "expected around" phrasing. */
function formatIstDateBare(ymd: string, withYear: boolean): string {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
  }).formatToParts(new Date(`${ymd}T12:00:00+05:30`));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const head = `${get('day')} ${get('month')}`;
  return withYear ? `${head} ${get('year')}` : head;
}

export function examShortLabel(target: ExamCountdownTarget): string {
  const exam = EXAM_TYPE_LABELS[target.exam_type] ?? target.exam_type.toUpperCase();
  const phase = target.phase ? PHASE_LABELS[target.phase] ?? '' : '';
  return `${exam} ${phase}`.trim();
}

/**
 * Turn a target into words. The single source of every countdown string in the
 * app, so three surfaces cannot word the same fact differently.
 *
 * Rule table lives in the plan doc; the shape is: granularity coarsens with
 * distance, and an 'expected' date is hedged at every distance. Below a week an
 * expected date stops counting entirely, because a single-digit day count on a
 * guess reads as certainty we do not have.
 */
export function describeExamCountdown(
  target: ExamCountdownTarget | null,
  todayIst: string = istToday(),
): ExamCountdownView | null {
  if (!target) return null;

  const d = daysUntil(target.exam_date, todayIst);
  const isEstimate = target.confidence === 'expected';
  const shortLabel = examShortLabel(target);
  const note = isEstimate ? target.note : null;

  const months = Math.round(d / 30);
  const weeks = Math.round(d / 7);

  const base = {
    days_left: d,
    short_label: shortLabel,
    is_estimate: isEstimate,
    note,
    visible: true,
  };

  // More than a week past, whatever the confidence: retire the surface. No cron
  // needed, a finished countdown cleans itself up.
  if (d < -7) {
    return {
      ...base,
      band: 'past',
      tone: 'neutral',
      value: 'Done',
      headline: 'The exam is done',
      detail: `It was on ${formatIstDate(target.exam_date, true)}.`,
      chip: null,
      is_estimate: false,
      note: null,
      visible: false,
    };
  }

  // Recently past and the date was official: say so plainly.
  // A recently past ESTIMATE falls through to the alarm below instead, because
  // "the exam is done" is the wrong thing to tell someone when we were guessing.
  if (d < 0 && !isEstimate) {
    return {
      ...base,
      band: 'past',
      tone: 'neutral',
      value: 'Done',
      headline: 'The exam is done',
      detail: `It was on ${formatIstDate(target.exam_date, false)}.`,
      chip: null,
      is_estimate: false,
      note: null,
    };
  }

  // An unconfirmed date inside a week is a data-quality alarm, not a countdown.
  // Warning tone so staff notice; no number, so nobody is told the exam "may be
  // tomorrow", which is panic rather than information.
  if (isEstimate && d <= 7) {
    return {
      ...base,
      band: 'unconfirmed_near',
      tone: 'warning',
      value: 'Not confirmed',
      headline: 'Exam date not confirmed yet',
      detail: `We expect it around ${formatIstDateBare(target.exam_date, false)}. Your teacher will confirm the exact date.`,
      chip: 'Check',
    };
  }

  if (d === 0) {
    return {
      ...base,
      band: 'today',
      tone: 'urgent',
      value: 'Today',
      headline: 'Exam day is today',
      detail: 'All the best.',
      chip: 'Today',
    };
  }

  if (d === 1) {
    return {
      ...base,
      band: 'tomorrow',
      tone: 'urgent',
      value: 'Tomorrow',
      headline: 'The exam is tomorrow',
      detail: formatIstDate(target.exam_date, false),
      chip: '1d',
    };
  }

  // From here the shape is shared and only the hedging differs. An estimate
  // never raises the alarm colour at distance: you do not turn a sixteen year
  // old's screen red over a guess.
  const hedge = (s: string) => (isEstimate ? `About ${s}` : s);
  const expectedDetail = (withYear: boolean) =>
    `Expected around ${formatIstDateBare(target.exam_date, withYear)}. The exact date is not announced yet.`;

  if (d > 90) {
    const unit = `${months} months`;
    return {
      ...base,
      band: 'far',
      tone: 'neutral',
      value: hedge(unit),
      headline: `${hedge(unit)} to go`,
      detail: isEstimate ? expectedDetail(true) : formatIstDate(target.exam_date, true),
      chip: null,
    };
  }

  if (d > 30) {
    const unit = `${weeks} weeks`;
    return {
      ...base,
      band: 'weeks',
      tone: 'neutral',
      value: hedge(unit),
      headline: `${hedge(unit)} to go`,
      detail: isEstimate ? expectedDetail(true) : formatIstDate(target.exam_date, true),
      chip: d <= 60 ? (isEstimate ? `~${d}d` : `${d}d`) : null,
    };
  }

  if (d > 7) {
    const unit = `${d} days`;
    return {
      ...base,
      band: 'days',
      tone: isEstimate ? 'neutral' : 'info',
      value: hedge(unit),
      headline: `${hedge(unit)} to go`,
      detail: isEstimate ? expectedDetail(false) : formatIstDate(target.exam_date, false),
      chip: isEstimate ? `~${d}d` : `${d}d`,
    };
  }

  // 2..7 days, confirmed only (an estimate was caught by the alarm above).
  return {
    ...base,
    band: 'final_week',
    tone: 'warning',
    value: `${d} days`,
    headline: `${d} days to go`,
    detail: formatIstDate(target.exam_date, false),
    chip: `${d}d`,
  };
}

// ---------------------------------------------------------------------------
// The hero timer
// ---------------------------------------------------------------------------

/**
 * The student dashboard's headline countdown, layered on top of the shared view
 * rather than replacing it, so every other surface keeps the same vocabulary.
 *
 * It differs from `value` in one deliberate way: it shows an exact day count
 * even for an unannounced date, where `value` rounds to "About 6 months". That
 * is not a retreat from the hedging rule, it relocates it. "173" is precise
 * *given* the assumed date, and the assumption is what the Expected chip, the
 * caption and the note all state plainly. A number is what makes a countdown
 * motivating; hiding it behind "about 6 months" is what made students ignore it.
 *
 * The one place a number is still refused is `unconfirmed_near`, where the guess
 * is close enough that a day count would read as a real deadline.
 */
export interface ExamHeroView {
  /** The shared view, for tone, label, detail, note and visibility. */
  view: ExamCountdownView;
  /** The large figure: "173", or a word when a number would mislead. */
  big: string;
  /** What the figure means: "days to go". */
  unit: string;
  /** True when `big` is a numeral, so the type scale can be set accordingly. */
  showNumber: boolean;
  /** One line tying the clock to the thing that moves it: turning up. */
  motivation: string;
  /** How much of the preparation window has gone, 0..100. Null if unknowable. */
  elapsed_pct: number | null;
}

/**
 * The nudge under the number. Tied to attending class, because that is the
 * behaviour a countdown on a course dashboard can actually change, and phrased
 * as encouragement rather than threat. Deadline pressure alone raises anxiety
 * without raising effort; pressure plus a concrete next action is what moves.
 */
const MOTIVATION: Record<ExamCountdownBand, string> = {
  far: 'Every class you sit in now is a mark you keep on exam day.',
  weeks: 'Steady work now beats cramming later.',
  days: 'This is the stretch that decides your score.',
  final_week: 'Revision time. Turn up and stay sharp.',
  tomorrow: 'Rest well tonight. You have put in the work.',
  today: 'All the best. Go and show them.',
  unconfirmed_near: 'Ask your teacher to confirm the exact date.',
  past: '',
};

/** How much of the plan's preparation window has already gone. */
function prepElapsedPct(target: ExamCountdownTarget, todayIst: string): number | null {
  if (!target.prep_started_on) return null;
  const total = daysUntil(target.exam_date, target.prep_started_on);
  if (total <= 0) return null;
  const remaining = daysUntil(target.exam_date, todayIst);
  const done = total - remaining;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

export function describeExamHero(
  target: ExamCountdownTarget | null,
  todayIst: string = istToday(),
): ExamHeroView | null {
  const view = describeExamCountdown(target, todayIst);
  if (!target || !view || !view.visible) return null;

  const d = view.days_left;
  let big: string;
  let unit: string;
  let showNumber = false;

  if (view.band === 'unconfirmed_near') {
    big = 'Soon';
    unit = 'date not confirmed';
  } else if (view.band === 'past') {
    big = 'Done';
    unit = 'exam written';
  } else if (view.band === 'today') {
    big = 'Today';
    unit = 'is exam day';
  } else if (view.band === 'tomorrow') {
    big = 'Tomorrow';
    unit = 'is the day';
  } else {
    big = String(d);
    unit = 'days to go';
    showNumber = true;
  }

  return {
    view,
    big,
    unit,
    showNumber,
    motivation: MOTIVATION[view.band],
    elapsed_pct: prepElapsedPct(target, todayIst),
  };
}
