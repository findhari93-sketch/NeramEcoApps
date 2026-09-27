/**
 * Pure helpers for the ops screens (Duplicates, Follow-ups, Lifecycle, Settings).
 *
 * India has no daylight saving, so India time is UTC + 5:30 all year. The
 * helpers do the arithmetic themselves instead of relying on the browser's
 * locale data, which keeps the output identical on every machine and in tests.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A Date whose UTC fields read as the India wall clock. */
function istFields(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MS);
}

/** Whole days since 1970-01-01 on the India calendar. */
export function istDayNumber(value: string | Date): number {
  const d = toDate(value);
  if (!d) return NaN;
  return Math.floor((d.getTime() + IST_OFFSET_MS) / DAY_MS);
}

/** "3:30 pm" in India time. */
export function formatIstTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  const f = istFields(d);
  const h = f.getUTCHours();
  const m = f.getUTCMinutes();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "26 Sep 2026" in India time. Empty string for a missing or bad value. */
export function formatIstDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  const f = istFields(d);
  return `${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
}

/** "26 Sep 2026, 3:30 pm" in India time. */
export function formatIstDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  return `${formatIstDate(d)}, ${formatIstTime(d)}`;
}

/** "Sep 2026" for a month key such as "2026-09-01". Read as a calendar date, no time zone shift. */
export function formatMonthKey(monthKey: string | null | undefined): string {
  if (!monthKey) return '';
  const m = /^(\d{4})-(\d{2})/.exec(monthKey);
  if (!m) return monthKey;
  const month = parseInt(m[2], 10) - 1;
  return month >= 0 && month < 12 ? `${MONTHS[month]} ${m[1]}` : monthKey;
}

export type DueTone = 'overdue' | 'today' | 'upcoming';

/**
 * How a follow-up's due time reads, on the India calendar. Overdue means due on
 * an earlier day (the same rule as the follow-ups API), so a call due at 10 am
 * today is "Today" all day, not overdue.
 */
export function describeDue(
  dueAt: string | Date | null | undefined,
  now: Date = new Date(),
): { tone: DueTone; text: string } {
  const d = toDate(dueAt);
  if (!d) return { tone: 'upcoming', text: 'No due time' };
  const diff = istDayNumber(d) - istDayNumber(now);
  const time = formatIstTime(d);
  if (diff < 0) {
    const days = -diff;
    return { tone: 'overdue', text: `Overdue by ${days} ${days === 1 ? 'day' : 'days'} (${formatIstDate(d)})` };
  }
  if (diff === 0) return { tone: 'today', text: `Today, ${time}` };
  if (diff === 1) return { tone: 'upcoming', text: `Tomorrow, ${time}` };
  const f = istFields(d);
  const sameYear = f.getUTCFullYear() === istFields(now).getUTCFullYear();
  const date = `${WEEKDAYS[f.getUTCDay()]} ${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]}${sameYear ? '' : ` ${f.getUTCFullYear()}`}`;
  return { tone: 'upcoming', text: `${date}, ${time}` };
}

/** Whole India-calendar days between a past moment and now (0 = today). Null when missing. */
export function daysAgo(value: string | Date | null | undefined, now: Date = new Date()): number | null {
  const d = toDate(value);
  if (!d) return null;
  return Math.max(0, istDayNumber(now) - istDayNumber(d));
}

/** "today", "yesterday", "12 days ago". */
export function agoText(value: string | Date | null | undefined, now: Date = new Date()): string {
  const n = daysAgo(value, now);
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
}

// ---------------------------------------------------------------------------
// Sign-in methods
// ---------------------------------------------------------------------------

export type SignInMethod = 'google' | 'microsoft' | 'phone';

export const SIGN_IN_LABELS: Record<SignInMethod, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  phone: 'Phone',
};

/**
 * The ways a person can sign in, from the columns the queue returns:
 * firebase_uid is the app (Google) sign-in, ms_oid the Microsoft account and a
 * phone number the phone sign-in. Parent portal ids ("parent:...") are not a
 * Microsoft account and are ignored.
 */
export function signInMethods(
  person: { firebase_uid?: string | null; ms_oid?: string | null; phone?: string | null } | null | undefined,
): SignInMethod[] {
  if (!person) return [];
  const out: SignInMethod[] = [];
  if (person.firebase_uid && person.firebase_uid.trim()) out.push('google');
  if (person.ms_oid && person.ms_oid.trim() && !person.ms_oid.startsWith('parent:')) out.push('microsoft');
  if (person.phone && person.phone.replace(/\D/g, '').length >= 10) out.push('phone');
  return out;
}

// ---------------------------------------------------------------------------
// Typed confirmation
// ---------------------------------------------------------------------------

/** True when the typed text is the confirmation word (case and outer spaces ignored). */
export function isTypedConfirmation(typed: string | null | undefined, word = 'MERGE'): boolean {
  return (typed || '').trim().toUpperCase() === word.toUpperCase();
}

// ---------------------------------------------------------------------------
// URL tab params
// ---------------------------------------------------------------------------

/** The value when it is one of the allowed ones, otherwise the fallback. */
export function pickParam<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Sum of a count map, ignoring missing or bad values. */
export function sumCounts(counts: Record<string, number | null | undefined> | null | undefined): number {
  if (!counts) return 0;
  return Object.values(counts).reduce<number>((s, v) => s + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0);
}

/** "db_table_name" to "Db table name". */
export function humanizeKey(key: string | null | undefined): string {
  if (!key) return '';
  const s = key.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Lifecycle rules form
// ---------------------------------------------------------------------------

export type RuleNumberKey = 'student_quiet_days' | 'lead_archive_days' | 'archived_deactivate_days' | 'not_started_decision_days';

/** Mirrors the limits in packages/database lifecycle-admin.ts (the server re-checks). */
export const RULE_LIMITS: Record<RuleNumberKey, [number, number]> = {
  student_quiet_days: [7, 120],
  lead_archive_days: [30, 730],
  archived_deactivate_days: [90, 1825],
  not_started_decision_days: [3, 60],
};

export const REMINDER_DAY_LIMITS = { min: 1, max: 30, maxCount: 5 };

export interface RulesFormValues {
  student_quiet_days: string;
  lead_archive_days: string;
  archived_deactivate_days: string;
  not_started_decision_days: string;
  suggest_graduation: boolean;
  join_reminder_days: number[];
}

export type RulesFormErrors = Partial<Record<RuleNumberKey | 'join_reminder_days' | 'form', string>>;

/** Field-level errors for the settings form. Empty object when valid. */
export function validateRulesForm(values: RulesFormValues): RulesFormErrors {
  const errors: RulesFormErrors = {};
  for (const key of Object.keys(RULE_LIMITS) as RuleNumberKey[]) {
    const [min, max] = RULE_LIMITS[key];
    const raw = (values[key] ?? '').toString().trim();
    const n = Number(raw);
    if (!raw) errors[key] = 'Enter a number of days.';
    else if (!/^\d+$/.test(raw) || !Number.isInteger(n)) errors[key] = 'Use whole days, for example 30.';
    else if (n < min || n > max) errors[key] = `Use a number from ${min} to ${max}.`;
  }
  if (!errors.lead_archive_days && !errors.archived_deactivate_days) {
    if (Number(values.archived_deactivate_days) <= Number(values.lead_archive_days)) {
      errors.archived_deactivate_days = 'Must be longer than the archive rule.';
    }
  }
  const days = values.join_reminder_days || [];
  if (days.length === 0) errors.join_reminder_days = 'Add at least one reminder day.';
  else if (days.length > REMINDER_DAY_LIMITS.maxCount) errors.join_reminder_days = `Use at most ${REMINDER_DAY_LIMITS.maxCount} reminder days.`;
  else if (days.some((d) => !Number.isInteger(d) || d < REMINDER_DAY_LIMITS.min || d > REMINDER_DAY_LIMITS.max)) {
    errors.join_reminder_days = `Each reminder day must be from ${REMINDER_DAY_LIMITS.min} to ${REMINDER_DAY_LIMITS.max}.`;
  }
  return errors;
}

/** Add one reminder day: parse, check, de-duplicate and sort. */
export function addReminderDay(days: number[], input: string): { days: number[]; error?: string } {
  const raw = input.trim();
  if (!raw) return { days, error: 'Type a day first.' };
  if (!/^\d+$/.test(raw)) return { days, error: 'Use a whole number of days.' };
  const n = parseInt(raw, 10);
  if (n < REMINDER_DAY_LIMITS.min || n > REMINDER_DAY_LIMITS.max) {
    return { days, error: `Use a day from ${REMINDER_DAY_LIMITS.min} to ${REMINDER_DAY_LIMITS.max}.` };
  }
  if (days.includes(n)) return { days, error: `Day ${n} is already in the list.` };
  if (days.length >= REMINDER_DAY_LIMITS.maxCount) {
    return { days, error: `Use at most ${REMINDER_DAY_LIMITS.maxCount} reminder days.` };
  }
  return { days: [...days, n].sort((a, b) => a - b) };
}

/**
 * Map the server's validation message (sentences naming the rule key) to form
 * fields. Anything that names no field lands on `form`.
 */
export function mapRuleServerErrors(message: string | null | undefined): RulesFormErrors {
  const out: RulesFormErrors = {};
  if (!message) return out;
  const sentences = message.split(/(?<=\.)\s+/).filter(Boolean);
  const keys: Array<RuleNumberKey | 'join_reminder_days'> = [
    'student_quiet_days',
    'lead_archive_days',
    'archived_deactivate_days',
    'not_started_decision_days',
    'join_reminder_days',
  ];
  for (const sentence of sentences) {
    const key = keys.find((k) => sentence.startsWith(k));
    if (key) {
      const rest = sentence.slice(key.length).trim();
      out[key] = rest ? `This ${rest}` : 'Check this value.';
    } else if (/later than archiving/i.test(sentence)) {
      out.archived_deactivate_days = 'Must be longer than the archive rule.';
    } else {
      out.form = out.form ? `${out.form} ${sentence}` : sentence;
    }
  }
  return out;
}
