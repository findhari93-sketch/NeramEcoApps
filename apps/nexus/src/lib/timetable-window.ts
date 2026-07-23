/**
 * The timetable's evening class window.
 *
 * Neram runs one class a day, 7 to 8 PM, all year. Rendering a full 8 AM to
 * 8 PM day means thirteen columns of nothing around a single block, so the
 * calendar draws only this window. The admin sets it once; every user gets a
 * compact/full toggle on top.
 *
 * Stored as a single `nexus_settings` row so it costs one read on the already
 * dynamic /api/auth/me route rather than a request of its own.
 *
 * Pure TypeScript (no JSX, no React) so it can be imported from server routes,
 * client components and the pure band maths in components/timetable/date-utils.
 */

/** The settings key this window lives under in `nexus_settings`. */
export const TIMETABLE_WINDOW_KEY = 'timetable_window';

/** ISO weekday numbers: 1 = Monday through 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TimetableWindow {
  /** Window open, "HH:MM". */
  start: string;
  /** Window close, "HH:MM". */
  end: string;
  /** Which weekdays get a column. Sunday is excluded by default. */
  days: IsoWeekday[];
}

/**
 * Used when the admin has not saved a window, and as the repair target for bad
 * input.
 *
 * Frozen on purpose. This is module-level state in a long-lived serverless
 * instance, so a caller mutating it would silently corrupt every later request.
 * Hand out `cloneDefaultWindow()` instead of the object itself.
 */
export const DEFAULT_WINDOW: TimetableWindow = Object.freeze({
  start: '18:00',
  end: '21:00',
  days: Object.freeze([1, 2, 3, 4, 5, 6]) as unknown as IsoWeekday[],
}) as TimetableWindow;

/** A fresh, fully mutable copy of the default. Never returns shared references. */
export function cloneDefaultWindow(): TimetableWindow {
  return { start: DEFAULT_WINDOW.start, end: DEFAULT_WINDOW.end, days: [...DEFAULT_WINDOW.days] };
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(time: string): number {
  const [h, m] = time.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

/**
 * Coerce an untrusted settings value into a usable window.
 *
 * Never throws and never returns something the grid cannot draw: a bad field
 * falls back to its default, and an end at or before the start is pushed out to
 * one hour. A malformed settings row must not be able to break the timetable.
 */
export function parseWindow(value: unknown): TimetableWindow {
  if (!value || typeof value !== 'object') return cloneDefaultWindow();
  const raw = value as Record<string, unknown>;

  const start = typeof raw.start === 'string' && HHMM.test(raw.start) ? raw.start : DEFAULT_WINDOW.start;
  let end = typeof raw.end === 'string' && HHMM.test(raw.end) ? raw.end : DEFAULT_WINDOW.end;

  if (toMinutes(end) <= toMinutes(start)) {
    const pushed = Math.min(toMinutes(start) + 60, 23 * 60 + 59);
    end = `${String(Math.floor(pushed / 60)).padStart(2, '0')}:${String(pushed % 60).padStart(2, '0')}`;
  }

  const days = Array.isArray(raw.days)
    ? (Array.from(
        new Set(
          raw.days.filter(
            (d): d is IsoWeekday => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7,
          ),
        ),
      ).sort((a, b) => a - b) as IsoWeekday[])
    : [...DEFAULT_WINDOW.days];

  return { start, end, days: days.length > 0 ? days : [...DEFAULT_WINDOW.days] };
}

/** Short human summary for the admin card and the "showing" footnote. */
export function describeWindow(window: TimetableWindow): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return m === '00' ? `${hour % 12 || 12} ${ampm}` : `${hour % 12 || 12}:${m} ${ampm}`;
  };
  return `${fmt(window.start)} to ${fmt(window.end)}`;
}

const DAY_NAMES: Record<IsoWeekday, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

/** "Mon to Sat" when contiguous, otherwise "Mon, Wed, Fri". */
export function describeDays(days: IsoWeekday[]): string {
  if (days.length === 0) return 'No days';
  if (days.length === 1) return DAY_NAMES[days[0]];

  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (contiguous) return `${DAY_NAMES[days[0]]} to ${DAY_NAMES[days[days.length - 1]]}`;
  return days.map((d) => DAY_NAMES[d]).join(', ');
}

export { DAY_NAMES };
