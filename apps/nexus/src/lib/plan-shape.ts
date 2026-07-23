/**
 * Plan shape: the hours and days a teaching plan is taught in.
 *
 * Neram runs two very different seasons:
 *
 *  - Regular (roughly June to March): one class a day, 7 to 8 PM, because
 *    school students are only free in the evening.
 *  - Crash course (after the board exams end, roughly March to June): students
 *    are free all day, so classes run in the morning AND the evening.
 *
 * The changeover date is not knowable in advance: it depends on when the board
 * exams actually finish that year. So the shape has to be data, set per year.
 *
 * It lives on the TEACHING PLAN rather than in a separate "term" table, because
 * a plan already carries `start_date` and `expected_end_date`. A plan is a
 * season. Describing the crash course twice, once as a plan and once as a term,
 * is only a way for the two to disagree.
 *
 * Pure TypeScript: shared by the API routes, the calendar and the plan builder.
 */

import type { IsoWeekday } from './timetable-window';

export interface TimeBand {
  /** "HH:MM" */
  start: string;
  /** "HH:MM" */
  end: string;
  /** Shown on the grid's break marker, e.g. "Morning". Optional. */
  label?: string;
}

/**
 * The subset of a teaching plan the calendar needs. Deliberately not the whole
 * plan: the calendar has no business knowing about entries or coverage.
 */
export interface PlanShape {
  id: string;
  classroom_id: string;
  title: string;
  /** YYYY-MM-DD, inclusive. */
  start_date: string;
  /** YYYY-MM-DD, inclusive. A plan with no end date runs open-ended. */
  end_date: string | null;
  bands: TimeBand[];
  days: IsoWeekday[];
  status: string;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(mins, 23 * 60 + 59));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** What a regular, evening-only plan starts from. Matches the column default. */
export const DEFAULT_REGULAR_BANDS: TimeBand[] = [{ start: '18:00', end: '21:00', label: 'Evening' }];

/** What a crash-course plan starts from: two bands, not one wide one. */
export const DEFAULT_CRASH_BANDS: TimeBand[] = [
  { start: '09:00', end: '12:30', label: 'Morning' },
  { start: '18:00', end: '20:00', label: 'Evening' },
];

/**
 * Coerce untrusted band JSON into something drawable.
 *
 * Bands come from an editable JSONB column, so this must never throw and never
 * return a band the grid cannot render. Invalid entries are dropped; if that
 * leaves nothing, the caller's fallback is used.
 *
 * Also accepts the older `nexus_course_plans.sessions_per_day` spellings
 * (`start_time`/`end_time`), which exist in production in three different
 * shapes, so a plan migrated from that table still draws.
 */
export function normaliseBands(value: unknown, fallback: TimeBand[] = DEFAULT_REGULAR_BANDS): TimeBand[] {
  if (!Array.isArray(value)) return fallback.map((b) => ({ ...b }));

  const cleaned: TimeBand[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;
    const start = typeof b.start === 'string' ? b.start : typeof b.start_time === 'string' ? b.start_time : null;
    const end = typeof b.end === 'string' ? b.end : typeof b.end_time === 'string' ? b.end_time : null;
    if (!start || !end) continue;
    if (!HHMM.test(start) || !HHMM.test(end)) continue;
    if (timeToMinutes(end) <= timeToMinutes(start)) continue;
    cleaned.push({
      start,
      end,
      ...(typeof b.label === 'string' && b.label.trim() ? { label: b.label.trim() } : {}),
    });
  }

  if (cleaned.length === 0) return fallback.map((b) => ({ ...b }));
  return mergeBands(cleaned);
}

/**
 * Sort bands and merge any that touch or overlap.
 *
 * Two overlapping bands would draw two grids on top of each other, and two that
 * merely touch (12:00-13:00 and 13:00-14:00) should read as one continuous
 * stretch rather than a break with nothing in it.
 */
export function mergeBands(bands: TimeBand[]): TimeBand[] {
  const sorted = [...bands].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const out: TimeBand[] = [];

  for (const band of sorted) {
    const last = out[out.length - 1];
    if (last && timeToMinutes(band.start) <= timeToMinutes(last.end)) {
      if (timeToMinutes(band.end) > timeToMinutes(last.end)) last.end = band.end;
      continue;
    }
    out.push({ ...band });
  }

  return out;
}

/** Coerce an untrusted weekday array. Falls back to Mon through Sat. */
export function normaliseDays(value: unknown): IsoWeekday[] {
  const fallback: IsoWeekday[] = [1, 2, 3, 4, 5, 6];
  if (!Array.isArray(value)) return fallback;
  const days = Array.from(
    new Set(
      value.filter((d): d is IsoWeekday => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7),
    ),
  ).sort((a, b) => a - b);
  return days.length > 0 ? days : fallback;
}

/** Coerce a teaching-plan row read from the database into a drawable shape. */
export function normalisePlanShape(row: Record<string, unknown>): PlanShape {
  const end = row.expected_end_date ?? row.end_date;
  return {
    id: String(row.id ?? ''),
    classroom_id: String(row.classroom_id ?? ''),
    title: String(row.title ?? 'Course plan'),
    start_date: String(row.start_date ?? '').slice(0, 10),
    end_date: end ? String(end).slice(0, 10) : null,
    bands: normaliseBands(row.class_bands ?? row.sessions_per_day),
    days: normaliseDays(row.class_days),
    status: String(row.status ?? 'draft'),
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface PlanShapeDraft {
  bands?: unknown;
  days?: unknown;
}

export interface PlanShapeValidation {
  ok: boolean;
  error: string | null;
  value: { bands: TimeBand[]; days: IsoWeekday[] } | null;
}

/**
 * Validate the class hours a user is about to save.
 *
 * Returns a message the UI can show directly, rather than a code to translate.
 * Strict where `normaliseBands` is forgiving: a teacher editing hours should be
 * told what is wrong, not have a row silently dropped.
 */
export function validatePlanShape(draft: PlanShapeDraft): PlanShapeValidation {
  const fail = (error: string): PlanShapeValidation => ({ ok: false, error, value: null });

  if (!Array.isArray(draft.bands) || draft.bands.length === 0) {
    return fail('Add at least one time band, for example 7:00 PM to 8:00 PM.');
  }
  if ((draft.bands as unknown[]).length > 4) {
    return fail('Four time bands in one day is already a lot. Remove one.');
  }
  for (const raw of draft.bands as unknown[]) {
    const b = raw as Record<string, unknown>;
    if (typeof b?.start !== 'string' || !HHMM.test(b.start)) {
      return fail('One of the bands has an invalid start time.');
    }
    if (typeof b?.end !== 'string' || !HHMM.test(b.end)) {
      return fail('One of the bands has an invalid end time.');
    }
    if (timeToMinutes(b.end) <= timeToMinutes(b.start)) {
      return fail('A band ends before it starts.');
    }
  }

  if (Array.isArray(draft.days) && draft.days.length === 0) {
    return fail('Pick at least one day of the week.');
  }

  return {
    ok: true,
    error: null,
    value: { bands: mergeBands(draft.bands as TimeBand[]), days: normaliseDays(draft.days) },
  };
}

// ─── Resolution ──────────────────────────────────────────────────────────────

/** Does this plan cover the given date? An open-ended plan has no upper bound. */
export function planCoversDate(plan: PlanShape, date: string): boolean {
  if (!plan.start_date || plan.start_date > date) return false;
  return !plan.end_date || date <= plan.end_date;
}

/** Every plan covering a date. More than one is legal, see below. */
export function plansForDate(plans: PlanShape[], date: string): PlanShape[] {
  return plans.filter((p) => planCoversDate(p, date));
}

/**
 * The bands to draw for a set of dates, and the weekdays that need a column.
 *
 * A week can straddle a changeover: the board exams end on a Wednesday and the
 * crash course starts on the Thursday. Rather than pick one shape and hide the
 * other, the union of every covering plan's bands is drawn, so that week
 * honestly shows mornings appearing partway through.
 *
 * The union is also why overlapping plans are tolerated rather than rejected.
 * Terms had to tile the year because a term existed only to answer "what shape
 * is this day"; plans exist for their own reasons and may legitimately overlap
 * while one is being wound down and the next is being built.
 */
export function resolvePlanShapeForDates(
  plans: PlanShape[],
  dates: string[],
): { bands: TimeBand[]; days: IsoWeekday[]; planNames: string[] } {
  const active = new Map<string, PlanShape>();
  for (const date of dates) {
    for (const plan of plansForDate(plans, date)) active.set(plan.id, plan);
  }

  if (active.size === 0) {
    return { bands: [], days: [], planNames: [] };
  }

  const list = [...active.values()];
  return {
    bands: mergeBands(list.flatMap((p) => p.bands)),
    days: normaliseDays(list.flatMap((p) => p.days)),
    planNames: list.map((p) => p.title),
  };
}

/**
 * Plans whose dates overlap a candidate. A WARNING, not an error.
 *
 * Worth surfacing when someone sets up next year's crash course, because two
 * plans covering one day usually means a date was mistyped. But it is never
 * blocking: the resolver above copes, and refusing the save would break plans
 * that already overlap in production.
 */
export function findOverlap(
  candidate: { start_date: string; end_date: string | null; id?: string },
  existing: Pick<PlanShape, 'id' | 'title' | 'start_date' | 'end_date'>[],
): { id: string; title: string }[] {
  const candEnd = candidate.end_date ?? '9999-12-31';
  return existing
    .filter((p) => {
      if (candidate.id && p.id === candidate.id) return false;
      const end = p.end_date ?? '9999-12-31';
      // Inclusive ranges overlap unless one ends before the other begins.
      return candidate.start_date <= end && p.start_date <= candEnd;
    })
    .map((p) => ({ id: p.id, title: p.title }));
}

/** "6 PM to 9 PM" for one band, or "9 AM to 12:30 PM, 6 PM to 8 PM" for several. */
export function describeBands(bands: TimeBand[]): string {
  if (bands.length === 0) return 'No class hours set';
  const fmt = (t: string) => {
    const [h, m] = t.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return m === '00' ? `${hour % 12 || 12} ${ampm}` : `${hour % 12 || 12}:${m} ${ampm}`;
  };
  return bands.map((b) => `${fmt(b.start)} to ${fmt(b.end)}`).join(', ');
}

/** Total teaching minutes a plan offers in one day. Used in the builder summary. */
export function bandMinutes(bands: TimeBand[]): number {
  return bands.reduce((sum, b) => sum + (timeToMinutes(b.end) - timeToMinutes(b.start)), 0);
}

export { minutesToTime };
