import type { RegisterClass } from '@/app/api/attendance/register/route';

/**
 * The register hand-rolls its own weekday, month and AM/PM formatting rather
 * than asking Intl for them.
 *
 * `toLocaleDateString('en-IN', { weekday: 'short', month: 'short' })` and
 * `toLocaleTimeString('en-IN', { hour12: true })` read from the CLDR data
 * bundled with the running Node version, not from a fixed table, and that
 * data has changed: one Node build renders "Tue 15 Sep" and "7:00 PM", the
 * next renders "Tue, 15 Sept" and "7:00 pm" for the exact same instant. A
 * teacher does not care which ICU shipped with the server, and a card whose
 * wording drifts with a Node upgrade is a bug nobody would think to blame on
 * a formatter. IST has no DST and a fixed +05:30 offset, so the conversion
 * itself is plain arithmetic and needs no locale data at all.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Tue 15 Sep", from a plain YYYY-MM-DD. The date has no timezone of its own: it is already the IST calendar day. */
export function formatClassDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const weekday = WEEKDAY_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTH_SHORT[month - 1]}`;
}

/** "7:00 PM" in IST from an ISO instant. */
export function formatClock(iso: string): string {
  const ist = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const hour24 = ist.getUTCHours();
  const minute = ist.getUTCMinutes();
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

/** "7:00 PM" in IST from a stored HH:MM:SS wall clock. */
export function formatWallClock(hhmmss: string, ymd: string): string {
  return formatClock(`${ymd}T${hhmmss}+05:30`);
}

/**
 * "7:00 PM" without its own meridiem when the range's end carries the same
 * one, so a same-period range reads "7:00 to 8:10 PM" rather than the
 * stuttering "7:00 PM to 8:10 PM". A range that crosses AM and PM keeps both.
 */
function dropRepeatedMeridiem(startLabel: string, endLabel: string): string {
  const meridiem = endLabel.slice(-2);
  return startLabel.endsWith(meridiem) ? startLabel.slice(0, -3) : startLabel;
}

/**
 * When the class ran, in the words the register uses.
 *
 * "held" when the room told us, "booked" when nothing was measured, so nobody
 * reads an estimate as a fact.
 */
export function formatHeldRange(cls: RegisterClass): string {
  if (!cls.held) {
    const start = formatWallClock(cls.start_time, cls.scheduled_date);
    const end = formatWallClock(cls.end_time, cls.scheduled_date);
    return `booked ${dropRepeatedMeridiem(start, end)} to ${end}`;
  }
  const start = formatClock(cls.held.start);
  const end = formatClock(cls.held.end);
  return `held ${dropRepeatedMeridiem(start, end)} to ${end}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Today in IST as YYYY-MM-DD, and the same date a number of days earlier.
 *
 * `Date.now()` is already a timezone-independent instant. An earlier version
 * of this also added the browser's own `getTimezoneOffset()` on top of the
 * fixed IST one, which was double counting: for a browser whose local zone IS
 * IST (offset -330), the two terms cancelled, the "shifted" instant stayed
 * exactly where it started, and `toISOString` then read the UTC calendar
 * date rather than the IST one. Every day between IST midnight and 5:29 AM,
 * that UTC date is still "yesterday", so a teacher opening the page in that
 * window silently got yesterday's range. The fix is the one fixed +05:30
 * shift this file already uses for `formatClock`, applied once, with nothing
 * added on top of it, and applied to `from` the same way so the two dates
 * stay a consistent number of days apart.
 */
export function istRange(days: number): { from: string; to: string } {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const to = ist.toISOString().slice(0, 10);
  const from = new Date(ist.getTime() - days * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}
