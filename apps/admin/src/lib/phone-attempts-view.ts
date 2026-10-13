import type { PhoneAttempt } from '@neram/database';

/** +919876543210 -> "+91 98765 43210"; other countries stay as stored. */
export function formatAttemptPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** Digits only, for tel: and wa.me links. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

const PAGE_LABELS: Array<[RegExp, string]> = [
  [/^\/demo-class/, 'Demo class'],
  [/^\/apply/, 'Application'],
  [/^\/enroll/, 'Enrolment'],
  [/^\/scholarship/, 'Scholarship'],
  [/^\/pay\//, 'Payment link'],
  [/^\/tools/, 'Tools App'],
];

/** Where the number was typed, in staff words. Locale prefixes are ignored. */
export function attemptPlace(source: string | null, sourceApp: string | null): string {
  if (source) {
    const path = source.replace(/^\/(en|ta|hi|kn|ml)(?=\/|$)/, '') || '/';
    for (const [pattern, label] of PAGE_LABELS) if (pattern.test(path)) return label;
    if (sourceApp === 'app') return 'Tools App';
    return path === '/' ? 'Home page' : path;
  }
  return sourceApp === 'app' ? 'Tools App' : sourceApp === 'marketing' ? 'Website' : 'Unknown page';
}

const ERROR_LABELS: Array<[RegExp, string]> = [
  [/already been rendered|captcha/i, 'reCAPTCHA check failed'],
  [/invalid-phone-number/i, 'Firebase said the number is invalid'],
  [/too-many-requests/i, 'Too many tries, blocked for a while'],
  [/quota-exceeded/i, 'Daily SMS limit reached'],
  [/invalid-verification-code|otp_verify_failed/i, 'Wrong OTP entered'],
  [/code-expired/i, 'OTP expired'],
  [/network-request-failed/i, 'Network error on their side'],
  [/already registered|PHONE_ALREADY_EXISTS/i, 'Number is on another account'],
];

/** The last failure, in staff words, or null. */
export function attemptErrorLabel(a: Pick<PhoneAttempt, 'last_error_code' | 'last_error_message'>): string | null {
  const text = `${a.last_error_code ?? ''} ${a.last_error_message ?? ''}`.trim();
  if (!text) return null;
  for (const [pattern, label] of ERROR_LABELS) if (pattern.test(text)) return label;
  return a.last_error_message || a.last_error_code;
}

export type AttemptTone = 'success' | 'warning' | 'error' | 'neutral';

/** One line saying where this number got to, and its tone. */
export function attemptStatus(a: PhoneAttempt): { label: string; tone: AttemptTone } {
  switch (a.status) {
    case 'verified':
      return { label: 'Verified', tone: 'success' };
    case 'otp_sent':
      return { label: 'OTP sent, never verified', tone: 'warning' };
    case 'failed': {
      const reason = attemptErrorLabel(a);
      return { label: reason ? `Failed: ${reason}` : 'Failed', tone: 'error' };
    }
    default: {
      // A later "entered" keeps the last error: they tapped Send again after a failure.
      const reason = attemptErrorLabel(a);
      return reason
        ? { label: `Tried again after: ${reason}`, tone: 'error' }
        : { label: 'Typed, OTP not sent', tone: 'neutral' };
    }
  }
}

export interface AttemptPerson<T extends PhoneAttempt = PhoneAttempt> {
  key: string;
  userId: string | null;
  attempts: T[];
  lastAt: string;
}

/**
 * One entry per person: an account, or a signed-out visitor (anonymous id),
 * each with every number they tried. Newest activity first.
 */
export function groupAttemptsByPerson<T extends PhoneAttempt>(attempts: T[]): AttemptPerson<T>[] {
  const people = new Map<string, AttemptPerson<T>>();
  for (const a of attempts) {
    const key = a.user_id ? `user:${a.user_id}` : `visitor:${a.anonymous_id ?? a.id}`;
    const entry = people.get(key) ?? { key, userId: a.user_id, attempts: [], lastAt: a.last_attempt_at };
    entry.attempts.push(a);
    if (a.last_attempt_at > entry.lastAt) entry.lastAt = a.last_attempt_at;
    people.set(key, entry);
  }
  return [...people.values()].sort((x, y) => (x.lastAt < y.lastAt ? 1 : x.lastAt > y.lastAt ? -1 : 0));
}
