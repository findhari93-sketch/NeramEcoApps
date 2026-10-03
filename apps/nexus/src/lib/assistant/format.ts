/**
 * Words for times and days, shared by the brief, the flows and the panel.
 * YYYY-MM-DD strings only, compared as strings, never through Date math that
 * could shift under a time zone (see lib/away-windows.ts for the reasoning).
 */
import { addDaysYmd, formatDay } from '@/lib/away-windows';

export { addDaysYmd, formatDay };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** IST calendar date, as every other student-facing surface counts "today". */
export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

/** "HH:MM" in IST right now, for "has this class already ended today". */
export function nowHHMMIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

/** "18:00" or "18:00:00" to "6:00 pm". Anything else is returned untouched. */
export function formatTime12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

export function dayOfWeek(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

export function daysBetweenYmd(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "today", "tomorrow", "yesterday", "Tuesday 6 Oct" within a week, else "20 Oct". */
export function relativeDay(ymd: string, today: string): string {
  const d = daysBetweenYmd(today, ymd);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d > 1 && d < 7) return `${WEEKDAYS[dayOfWeek(ymd)]} ${formatDay(ymd)}`;
  return formatDay(ymd);
}
