/**
 * Timetable date and time-band utilities.
 *
 * Pure functions, no React. These back both the Agenda ledger and the Grid
 * band, and replace the copies of getWeekDates / formatDateISO / isToday that
 * used to live inside TimeSlotGrid and WeeklyCalendarGrid.
 *
 * The band model: classes run in a narrow evening window (7 to 8 PM), so the
 * grid renders only the configured window rather than a whole day. Geometry is
 * a linear map from minutes-past-window-start to pixels at PX_PER_HOUR.
 */

/** Pixels per hour in the Grid view. Matches the approved design. */
export const PX_PER_HOUR = 70;

/** Top padding inside a day cell, so the first hour line is not flush. */
export const GRID_PAD_TOP = 4;

/** Slack below the last hour line so a class ending at the window end still breathes. */
export const GRID_PAD_BOTTOM = 10;

/** Gap subtracted from a block's height so adjacent blocks do not touch. */
const BLOCK_GAP = 4;

// The window shape lives in lib so API routes can import it without reaching
// into components. Re-exported here because every consumer of the band maths
// needs it too.
import { DEFAULT_WINDOW, type IsoWeekday, type TimetableWindow } from '@/lib/timetable-window';

export { DEFAULT_WINDOW };
export type { IsoWeekday, TimetableWindow };

/** A classroom holiday, keyed by date in the maps the views take. */
export interface HolidayInfo {
  title: string;
  description?: string | null;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

/** Local-date ISO string (YYYY-MM-DD). Never use toISOString(), it shifts to UTC. */
export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isToday(d: Date): boolean {
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

/** ISO weekday for a Date: 1 = Monday through 7 = Sunday. */
export function isoWeekday(d: Date): IsoWeekday {
  const js = d.getDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as IsoWeekday;
}

/** Local midnight of the given date. The calendar's anchor is always normalised. */
export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** `n` days later (or earlier, for a negative n). Handles month and year rollover. */
export function addDays(d: Date, n: number): Date {
  const out = startOfDay(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Local midnight of the 1st of the given date's month. */
export function startOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
}

/**
 * `n` months later, clamped to the last valid day.
 *
 * Naive `setMonth(m + 1)` on 31 January lands on 3 March, which would make
 * month navigation skip February entirely. Clamp instead: 31 Jan + 1 is 28 Feb.
 *
 * Note this is still lossy when chained (31 Jan, 28 Feb, 28 Mar), so the month
 * navigation in useTimetableView always recomputes from startOfMonth rather
 * than stepping the previous anchor.
 */
export function addMonths(d: Date, n: number): Date {
  const out = startOfDay(d);
  const day = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + n);
  const lastDayOfTarget = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, lastDayOfTarget));
  return out;
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export interface WeekDates {
  /** Every day of the week, Monday first. Used for the date range query. */
  allDays: Date[];
  /** Only the days the window includes. These become grid columns. */
  days: Date[];
  /** Monday, as YYYY-MM-DD. */
  start: string;
  /** Sunday, as YYYY-MM-DD. Always the full week so nothing is missed by the query. */
  end: string;
  /** Human label, e.g. "20 Jul, 26 Jul". */
  label: string;
}

/**
 * The Monday-anchored week `offset` weeks from today.
 *
 * `days` is filtered to the window's weekdays (Sunday is dropped by default),
 * but `start`/`end` always span the full Monday to Sunday range so a class
 * scheduled on an excluded day is still fetched and can be surfaced.
 */
export function getWeekDates(offset: number, weekdays: IsoWeekday[] = DEFAULT_WINDOW.days): WeekDates {
  return getWeekDatesFor(addDays(new Date(), offset * 7), weekdays);
}

/**
 * The Monday-anchored week CONTAINING `anchor`.
 *
 * The same thing getWeekDates computes, but addressed by date rather than by an
 * offset from today. The calendar navigates by anchor date (a week offset
 * cannot express "which month"), so this is the primitive and getWeekDates is
 * now a thin wrapper over it.
 */
export function getWeekDatesFor(
  anchor: Date,
  weekdays: IsoWeekday[] = DEFAULT_WINDOW.days,
): WeekDates {
  const base = startOfDay(anchor);
  const dayOfWeek = base.getDay();
  // Sunday (0) belongs to the week that STARTED six days ago, not the one
  // about to start. Getting this backwards shifts every Sunday by a week.
  const monday = addDays(base, dayOfWeek === 0 ? -6 : 1 - dayOfWeek);

  const allDays: Date[] = [];
  for (let i = 0; i < 7; i++) allDays.push(addDays(monday, i));

  const sunday = allDays[6];
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return {
    allDays,
    days: allDays.filter((d) => weekdays.includes(isoWeekday(d))),
    start: formatDateISO(monday),
    end: formatDateISO(sunday),
    label: `${fmt(monday)}, ${fmt(sunday)}`,
  };
}

// ─── Month grid ──────────────────────────────────────────────────────────────

export interface MonthGrid {
  /**
   * 5 or 6 rows of 7 REAL Dates, Monday first, including the spill days from
   * the previous and next month that fill the corners.
   *
   * Deliberately not the `(number | null)[][]` shape used by
   * components/gamification/AttendanceHeatmap.tsx: a calendar has to render its
   * spill days as real, clickable dates, whereas the heatmap only pads them out.
   */
  weeks: Date[][];
  /** `weeks` flattened: 35 or 42 dates. */
  days: Date[];
  /** The 1st of the month being displayed, for the "other month" dim. */
  monthStart: Date;
  /** First cell, as YYYY-MM-DD. This is what to FETCH, spill days included. */
  start: string;
  /** Last cell, as YYYY-MM-DD. */
  end: string;
  /** "Jul-26" */
  label: string;
}

/**
 * A month as "Jul-26", the house format for month-and-year.
 *
 * Built by hand rather than with `year: '2-digit'`: locales disagree on how
 * they join the two parts, and this string is compared exactly in tests and
 * read at a glance in a toolbar, so it must not drift with the runtime's ICU
 * data.
 */
export function formatMonthYear(d: Date): string {
  const month = d.toLocaleDateString('en-IN', { month: 'short' });
  return `${month}-${String(d.getFullYear() % 100).padStart(2, '0')}`;
}

/**
 * The month containing `anchor`, as whole Monday-anchored weeks.
 *
 * Row count is 5 or 6 depending on how the month falls, never a fixed 6: a
 * five-week month gets taller, more legible cells for free.
 */
export function getMonthGrid(anchor: Date): MonthGrid {
  const monthStart = startOfMonth(anchor);
  const firstCell = getWeekDatesFor(monthStart).allDays[0];

  // Walk whole weeks until the month is covered. A month spans at most 6.
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  let cursor = firstCell;
  do {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) row.push(addDays(cursor, i));
    weeks.push(row);
    cursor = addDays(cursor, 7);
  } while (cursor <= monthEnd);

  const days = weeks.flat();

  return {
    weeks,
    days,
    monthStart,
    start: formatDateISO(days[0]),
    end: formatDateISO(days[days.length - 1]),
    label: formatMonthYear(monthStart),
  };
}

/**
 * The fetch range for a view: the anchor's whole month grid, widened only if
 * the visible range pokes outside it.
 *
 * Anchored on the MONTH rather than derived from the visible range, because a
 * month grid already runs Monday to Sunday and re-widening one would pull in
 * the neighbouring months every time. That is what makes the range stable:
 * week, day and month views of the same month all produce an identical range,
 * so switching between them and paging days or weeks inside the month costs no
 * requests at all. Only crossing into a new month refetches.
 *
 * The widening still matters for a week that straddles two months (27 July to
 * 2 August): the anchor's grid may not reach the far end.
 */
export function monthGridRangeFor(
  anchor: Date,
  visibleStart: string,
  visibleEnd: string,
): { start: string; end: string } {
  const grid = getMonthGrid(anchor);
  return {
    start: visibleStart < grid.start ? visibleStart : grid.start,
    end: visibleEnd > grid.end ? visibleEnd : grid.end,
  };
}

// ─── Range labels ────────────────────────────────────────────────────────────

/**
 * The toolbar's period label, in a long form and a 375px-safe short form.
 *
 *   day    "Monday, 27 July 2026"    / "Mon 27 Jul"
 *   week   "20 to 26 July 2026"      / "20-26 Jul"
 *   month  "Jul-26"                  / "Jul-26"
 *
 * A week straddling two months or two years spells both out, since "20 to 26"
 * would otherwise be ambiguous.
 */
export function formatRangeLabel(
  mode: 'day' | 'week' | 'month' | 'agenda',
  days: Date[],
): { label: string; shortLabel: string } {
  if (days.length === 0) return { label: '', shortLabel: '' };

  const first = days[0];
  const last = days[days.length - 1];

  if (mode === 'day') {
    return {
      label: first.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      shortLabel: first.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    };
  }

  if (mode === 'month') {
    // NOT days[0]: a month grid opens on up to six spill days from the previous
    // month, so July 2026 would announce itself as June. The middle cell is
    // always inside the target month, whether the grid is 35 or 42 cells.
    const inMonth = days[Math.floor(days.length / 2)];
    // Same string at both widths: "Jul-26" already fits a 375px toolbar, and
    // the toolbar renders `label` above 600px, so shortening it would only
    // change the phone and leave the desktop untouched.
    const monthYear = formatMonthYear(inMonth);
    return { label: monthYear, shortLabel: monthYear };
  }

  // Week and agenda both show a week.
  const sameYear = first.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && first.getMonth() === last.getMonth();

  if (sameMonth) {
    return {
      label: `${first.getDate()} to ${last.getDate()} ${first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`,
      shortLabel: `${first.getDate()}-${last.getDate()} ${first.toLocaleDateString('en-IN', { month: 'short' })}`,
    };
  }

  const longOpts: Intl.DateTimeFormatOptions = sameYear
    ? { day: 'numeric', month: 'long' }
    : { day: 'numeric', month: 'long', year: 'numeric' };
  const shortOpts: Intl.DateTimeFormatOptions = sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' };

  return {
    label: `${first.toLocaleDateString('en-IN', longOpts)} to ${last.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    shortLabel: `${first.toLocaleDateString('en-IN', shortOpts)} - ${last.toLocaleDateString('en-IN', shortOpts)}`,
  };
}

/**
 * The weekdays that actually need a column: the configured set, plus any day
 * that has a class on it.
 *
 * Sunday is normally excluded, but a one-off Sunday revision class must not
 * vanish from the grid. Same principle as the band auto-expanding for an
 * out-of-window class: configuration narrows the default view, it never hides
 * real data.
 */
export function effectiveWeekdays(
  configured: IsoWeekday[],
  classes: { scheduled_date: string }[] = [],
): IsoWeekday[] {
  const set = new Set<IsoWeekday>(configured);
  for (const cls of classes) {
    const d = new Date(`${cls.scheduled_date}T00:00:00`);
    if (!Number.isNaN(d.getTime())) set.add(isoWeekday(d));
  }
  return Array.from(set).sort((a, b) => a - b);
}

// ─── Time helpers ────────────────────────────────────────────────────────────

/** "19:30" or "19:30:00" to 1170. Returns NaN for unparseable input. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  const hours = parseInt(h, 10);
  const mins = parseInt(m, 10);
  if (Number.isNaN(hours) || Number.isNaN(mins)) return NaN;
  return hours * 60 + mins;
}

/** 19 to "7 PM". Used for the grid's hour gutter. */
export function formatHourLabel(hour24: number): string {
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour24 % 12 || 12} ${ampm}`;
}

/** "19:30" to "7:30 PM". */
export function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

/**
 * "19:00" to "7 PM", "19:30" to "7:30 PM".
 *
 * The month view's chips are 20px tall and one line, so the ":00" that
 * formatTime always prints is four characters of pure noise there.
 * Returns the input unchanged if it cannot be parsed.
 */
export function formatTimeCompact(time: string): string {
  const [h, m] = (time ?? '').split(':');
  const hour = parseInt(h, 10);
  const mins = parseInt(m, 10);
  if (Number.isNaN(hour) || Number.isNaN(mins)) return time;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return mins === 0 ? `${h12} ${ampm}` : `${h12}:${String(mins).padStart(2, '0')} ${ampm}`;
}

// ─── Band resolution ─────────────────────────────────────────────────────────

/** Height of the visual break drawn between two bands of a split day. */
export const BREAK_HEIGHT = 26;

/**
 * One continuous stretch of the teaching day.
 *
 * A regular term has exactly one. A crash term has two (morning and evening),
 * so the calendar can collapse the six dead hours between them instead of
 * drawing an empty afternoon.
 */
export interface BandSegment {
  startMin: number;
  endMin: number;
  /** Whole hours to draw in the gutter for this segment. */
  hours: number[];
  /** Pixel offset of this segment's top within the day cell. */
  offset: number;
  height: number;
  label?: string;
}

export interface ResolvedBand {
  segments: BandSegment[];
  /** Earliest minute drawn, across all segments. */
  startMin: number;
  /** Latest minute drawn, across all segments. */
  endMin: number;
  /** Every gutter hour, flattened across segments. */
  hours: number[];
  /** Pixel height of one day cell, including any breaks. */
  cellHeight: number;
  /** How many classes fell outside the configured bands and forced them open. */
  expandedFor: number;
}

interface TimedItem {
  start_time: string;
  end_time: string;
}

/** A window is just the single-band case. */
function windowToBands(window: TimetableWindow): { start: string; end: string; label?: string }[] {
  const start = Number.isNaN(timeToMinutes(window.start)) ? DEFAULT_WINDOW.start : window.start;
  const end = Number.isNaN(timeToMinutes(window.end)) ? DEFAULT_WINDOW.end : window.end;
  return [{ start, end }];
}

/**
 * Resolve the band actually drawn, given the term's time bands (or a single
 * window) and the classes on screen.
 *
 * A class outside every band expands the nearest one to include it rather than
 * being hidden. Callers surface `expandedFor` so the stretch is explained
 * instead of looking like a bug.
 */
export function resolveBand(
  windowOrBands: TimetableWindow | { start: string; end: string; label?: string }[],
  classes: TimedItem[] = [],
): ResolvedBand {
  const rawBands = Array.isArray(windowOrBands) ? windowOrBands : windowToBands(windowOrBands);

  // Sort and merge so overlapping bands never draw on top of each other.
  const ranges = rawBands
    .map((b) => ({
      start: timeToMinutes(b.start),
      end: timeToMinutes(b.end),
      label: b.label,
    }))
    .filter((r) => !Number.isNaN(r.start) && !Number.isNaN(r.end) && r.end > r.start)
    .sort((a, b) => a.start - b.start);

  if (ranges.length === 0) {
    ranges.push({
      start: timeToMinutes(DEFAULT_WINDOW.start),
      end: timeToMinutes(DEFAULT_WINDOW.end),
      label: undefined,
    });
  }

  const merged: typeof ranges = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      if (r.end > last.end) last.end = r.end;
      continue;
    }
    merged.push({ ...r });
  }

  // Stretch to cover any class that falls outside every band. Each class is
  // counted once, and pulled into whichever band is nearest.
  let expandedFor = 0;
  for (const cls of classes) {
    const s = timeToMinutes(cls.start_time);
    const e = timeToMinutes(cls.end_time);
    if (Number.isNaN(s) || Number.isNaN(e)) continue;

    const covered = merged.some((r) => s >= r.start && e <= r.end);
    if (covered) continue;
    expandedFor++;

    // Nearest by distance to the band's midpoint.
    let best = merged[0];
    let bestDistance = Infinity;
    for (const r of merged) {
      const distance = Math.abs((s + e) / 2 - (r.start + r.end) / 2);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = r;
      }
    }
    if (s < best.start) best.start = Math.floor(s / 60) * 60;
    if (e > best.end) best.end = Math.ceil(e / 60) * 60;
  }

  // Expansion can make two bands collide, so merge once more.
  const final: typeof merged = [];
  for (const r of merged.sort((a, b) => a.start - b.start)) {
    const last = final[final.length - 1];
    if (last && r.start <= last.end) {
      if (r.end > last.end) last.end = r.end;
      continue;
    }
    final.push({ ...r });
  }

  const segments: BandSegment[] = [];
  let offset = GRID_PAD_TOP;

  final.forEach((r, i) => {
    const height = ((r.end - r.start) / 60) * PX_PER_HOUR;
    const hours: number[] = [];
    for (let h = Math.floor(r.start / 60); h <= Math.floor(r.end / 60); h++) hours.push(h);

    segments.push({ startMin: r.start, endMin: r.end, hours, offset, height, label: r.label });
    offset += height + (i < final.length - 1 ? BREAK_HEIGHT : 0);
  });

  return {
    segments,
    startMin: segments[0].startMin,
    endMin: segments[segments.length - 1].endMin,
    hours: segments.flatMap((s) => s.hours),
    cellHeight: offset + GRID_PAD_BOTTOM,
    expandedFor,
  };
}

/** The segment a given minute falls in, or the nearest one. */
function segmentFor(minute: number, band: ResolvedBand): BandSegment {
  for (const s of band.segments) {
    if (minute >= s.startMin && minute <= s.endMin) return s;
  }
  let best = band.segments[0];
  let bestDistance = Infinity;
  for (const s of band.segments) {
    const distance = minute < s.startMin ? s.startMin - minute : minute - s.endMin;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = s;
    }
  }
  return best;
}

/** Vertical offset of an hour line inside a day cell. */
export function hourOffset(hour24: number, band: ResolvedBand): number {
  const minute = hour24 * 60;
  const segment = segmentFor(minute, band);
  return segment.offset + ((minute - segment.startMin) / 60) * PX_PER_HOUR;
}

export interface BlockGeometry {
  top: number;
  height: number;
}

/**
 * Absolute position of a class block inside a day cell.
 *
 * Clamped to the band so a partially-outside class still renders as a visible
 * sliver rather than escaping the cell.
 */
export function blockGeometry(
  startTime: string,
  endTime: string,
  band: ResolvedBand,
): BlockGeometry {
  const rawStart = timeToMinutes(startTime);
  const rawEnd = timeToMinutes(endTime);
  const start = Number.isNaN(rawStart) ? band.startMin : rawStart;
  const end = Number.isNaN(rawEnd) ? start + 60 : rawEnd;

  // Position within the segment the class belongs to. A class is clamped to its
  // own segment, so a morning class can never bleed across the break into the
  // evening block below it.
  const segment = segmentFor(start, band);
  const clampedStart = Math.min(Math.max(start, segment.startMin), segment.endMin);
  const clampedEnd = Math.min(Math.max(end, clampedStart + 15), segment.endMin);

  return {
    top: segment.offset + ((clampedStart - segment.startMin) / 60) * PX_PER_HOUR,
    height: Math.max(((clampedEnd - clampedStart) / 60) * PX_PER_HOUR - BLOCK_GAP, 18),
  };
}

// ─── Countdown ───────────────────────────────────────────────────────────────

/**
 * Time until a class starts, as the Agenda hero's large countdown.
 *
 * Dates are built in IST (+05:30) explicitly: the students, the teachers and
 * the Teams meetings are all in one timezone, and relying on the browser's
 * offset makes the countdown wrong for anyone travelling.
 */
export function classStartDate(scheduledDate: string, startTime: string): Date {
  return new Date(`${scheduledDate}T${startTime.substring(0, 5)}:00+05:30`);
}

export function classEndDate(scheduledDate: string, endTime: string): Date {
  return new Date(`${scheduledDate}T${endTime.substring(0, 5)}:00+05:30`);
}

/** "4h 12m", "12m", or null once the class has started. */
export function formatCountdown(target: Date, from: Date = new Date()): string | null {
  const diffMs = target.getTime() - from.getTime();
  if (diffMs <= 0) return null;

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
