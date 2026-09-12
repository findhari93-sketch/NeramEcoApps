/**
 * When a reopened test closes, as a teacher picks it and a student reads it.
 *
 * Time of day is deliberately not a choice. The founder's words: "time is
 * actually not important, till tomorrow, one day or two days". So every deadline
 * is the END of an IST calendar day, 11:59 PM, and the teacher only picks the day.
 *
 * IST is stated rather than inferred from the device, as ExamScheduleDialog
 * does: a teacher reopening from a laptop set to another timezone must not move
 * the whole class's deadline.
 */

export type ReopenPreset = 'tomorrow' | '2d' | '3d' | '1w';

export const REOPEN_PRESETS: ReopenPreset[] = ['tomorrow', '2d', '3d', '1w'];

/** Chosen with the founder on 2026-09-11. */
export const DEFAULT_REOPEN_PRESET: ReopenPreset = '3d';

export const REOPEN_PRESET_LABELS: Record<ReopenPreset, string> = {
  tomorrow: 'Tomorrow',
  '2d': '2 days',
  '3d': '3 days',
  '1w': '1 week',
};

const PRESET_DAYS: Record<ReopenPreset, number> = { tomorrow: 1, '2d': 2, '3d': 3, '1w': 7 };

/** The furthest out a reopen may run. The message route checks the same bound. */
export const MAX_REOPEN_DAYS = 31;

/** An IST calendar date, `offset` days from now, as YYYY-MM-DD. */
export function istDatePlusDays(offset: number, now: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now + offset * 86_400_000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 11:59:59 PM IST on a YYYY-MM-DD calendar date, as an ISO instant. */
export function endOfIstDay(date: string): string {
  return new Date(`${date}T23:59:59+05:30`).toISOString();
}

/** The IST calendar date a preset lands on. */
export function presetDate(preset: ReopenPreset, now: number = Date.now()): string {
  return istDatePlusDays(PRESET_DAYS[preset], now);
}

/** "Mon 14 Sept, 11:59 PM". One comma, so it sits inside a sentence. */
export function formatReopenUntil(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dateParts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(d);
  const timeParts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const pick = (parts: Intl.DateTimeFormatPart[], t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = `${pick(dateParts, 'weekday')} ${pick(dateParts, 'day')} ${pick(dateParts, 'month')}`;
  const time = `${pick(timeParts, 'hour')}:${pick(timeParts, 'minute')} ${pick(timeParts, 'dayPeriod').toUpperCase()}`;
  return `${day}, ${time}`;
}

/**
 * Why a deadline cannot be used, or null when it can.
 *
 * Shared by the sheet (to disable Review) and the route (to refuse), so the two
 * can never disagree about what is allowed.
 */
export function reopenUntilProblem(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return 'Pick when it closes.';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'That date could not be read.';
  if (t <= now) return 'Pick a date that has not passed.';
  if (t > now + MAX_REOPEN_DAYS * 86_400_000) return `Pick a date within ${MAX_REOPEN_DAYS} days.`;
  return null;
}
