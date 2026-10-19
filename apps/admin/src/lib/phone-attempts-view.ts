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
  [/neram\/verify-phone/i, 'Our server could not save the verified number'],
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

// ---------------------------------------------------------------------------
// Why they got stuck
// ---------------------------------------------------------------------------

/**
 * bug: our sign-in (reCAPTCHA, Firebase setup, our server) broke, worth a
 * developer's look. sms: the SMS side (Firebase limits, OTP not arriving).
 * student: the student's choice or slip (closed it, wrong code, typo).
 * unclear: not enough to say (older rows, or still in progress).
 */
export type StuckKind = 'bug' | 'sms' | 'student' | 'unclear';

export interface StuckDiagnosis {
  kind: StuckKind;
  /** Short reason, staff words. */
  reason: string;
  /** What to do or check next. */
  hint: string;
}

export const STUCK_KIND_LABEL: Record<StuckKind, string> = {
  bug: 'Likely a bug',
  sms: 'SMS problem',
  student: 'Student stopped',
  unclear: 'Not sure yet',
};

const KIND_RANK: Record<StuckKind, number> = { bug: 0, sms: 1, unclear: 2, student: 3 };

const BUG_ERRORS = /neram\/verify-phone|neram\/recaptcha|already been rendered|captcha|internal-error|app-not-authorized|invalid-app-credential|missing-app-credential|argument-error|operation-not-allowed|web-storage-unsupported|unauthorized-domain/i;

function isInAppBrowser(a: Pick<PhoneAttempt, 'browser'>): boolean {
  return /in-app|WebView/i.test(a.browser ?? '');
}

/** "Android phone, Instagram in-app browser", or null when not recorded. */
export function attemptDevice(a: Pick<PhoneAttempt, 'device' | 'browser'>): string | null {
  const parts = [a.device, a.browser].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function leftWords(via: PhoneAttempt['left_via']): string {
  return via === 'skipped' ? 'tapped Skip' : via === 'tab_closed' ? 'closed the page' : 'closed the dialog';
}

/** Why one number was never verified. */
export function diagnoseAttempt(a: PhoneAttempt): StuckDiagnosis {
  const errorText = `${a.last_error_code ?? ''} ${a.last_error_message ?? ''}`.trim();
  const otpTries = a.otp_tries ?? 0;
  const hadHelp = (a.events ?? []).some((e) => e.e === 'help');
  const inApp = isInAppBrowser(a);

  if (errorText && (a.status === 'failed' || a.status === 'entered')) {
    const label = attemptErrorLabel(a) ?? 'Error';
    if (BUG_ERRORS.test(errorText)) {
      return {
        kind: 'bug',
        reason: label,
        hint: inApp
          ? 'Opened inside an in-app browser, where reCAPTCHA often breaks. Ask them to open the link in Chrome or Safari.'
          : 'Not their doing. Check the sign-in for this device and browser, and help them finish by phone.',
      };
    }
    if (/quota-exceeded|too-many-requests/i.test(errorText)) {
      return { kind: 'sms', reason: label, hint: 'Firebase is limiting SMS. Ask them to try again later, or verify by phone.' };
    }
    if (/invalid-verification-code|otp_verify_failed/i.test(errorText)) {
      return { kind: 'student', reason: `Wrong OTP entered${otpTries > 1 ? ` (${otpTries} codes tried)` : ''}`, hint: 'Ask them to use the newest SMS, or resend.' };
    }
    if (/code-expired/i.test(errorText)) {
      return { kind: 'student', reason: 'OTP expired before they typed it', hint: 'Ask them to resend and type it within a few minutes.' };
    }
    if (/invalid-phone-number/i.test(errorText)) {
      return { kind: 'student', reason: 'Typed a number that is not valid', hint: 'Check the number with them.' };
    }
    if (/network-request-failed/i.test(errorText)) {
      return { kind: 'student', reason: 'Their internet dropped', hint: 'Ask them to try again on a better connection.' };
    }
    if (/already registered|PHONE_ALREADY_EXISTS/i.test(errorText)) {
      return { kind: 'student', reason: 'Number is on another account', hint: 'They may have signed up before. Help them sign in to that account.' };
    }
    return { kind: 'bug', reason: `Unexpected error: ${label}`, hint: 'Not a known error. Worth a developer\'s look.' };
  }

  if (a.status === 'entered') {
    // Before step tracking, a lost "otp_sent" looked the same: do not cry bug.
    if (!(a.events ?? []).length) {
      return { kind: 'unclear', reason: 'Tapped Send OTP, no result recorded', hint: 'Tried before step tracking began, so the cause is unknown.' };
    }
    return a.left_via
      ? { kind: 'bug', reason: `Send OTP never finished, then they ${leftWords(a.left_via)}`, hint: 'Usually a reCAPTCHA puzzle or a hang while sending. Check this device and browser.' }
      : { kind: 'bug', reason: 'Send OTP never finished', hint: 'Usually a reCAPTCHA puzzle or a hang while sending. Check this device and browser.' };
  }

  // OTP went out.
  if (otpTries > 0) {
    return { kind: 'bug', reason: 'Typed the code, but checking it never finished', hint: 'No error came back. Check the verify step and our server logs.' };
  }
  if (a.attempts > 1) {
    return {
      kind: 'sms',
      reason: `Asked for the OTP ${a.attempts} times and never typed one`,
      hint: 'The SMS is probably not arriving. Check the number, or verify by phone.',
    };
  }
  if (a.left_via) {
    return {
      kind: 'student',
      reason: `OTP sent, they ${leftWords(a.left_via)} without typing it${hadHelp ? ' (opened help first)' : ''}`,
      hint: 'They may not have got the SMS. A quick call usually finishes it.',
    };
  }
  return { kind: 'unclear', reason: 'OTP sent, no code typed', hint: 'The SMS may not have arrived, or they left the page.' };
}

/**
 * One reason for a person: the most serious across their numbers (a bug
 * first), the newest when two are as serious.
 */
export function diagnosePerson(attempts: PhoneAttempt[]): StuckDiagnosis & { attempt: PhoneAttempt | null } {
  let best: (StuckDiagnosis & { attempt: PhoneAttempt }) | null = null;
  for (const a of attempts) {
    if (a.status === 'verified') continue;
    const d = { ...diagnoseAttempt(a), attempt: a };
    if (!best || KIND_RANK[d.kind] < KIND_RANK[best.kind] || (KIND_RANK[d.kind] === KIND_RANK[best.kind] && a.last_attempt_at > best.attempt.last_attempt_at)) {
      best = d;
    }
  }
  return best ?? { kind: 'unclear', reason: 'Nothing recorded', hint: '', attempt: null };
}

const STEP_WORDS: Record<string, string> = {
  entered: 'Tapped Send OTP',
  otp_sent: 'OTP sent',
  failed: 'Failed',
  verified: 'Verified',
  otp_checked: 'Typed a code',
  help: 'Opened Get help',
  closed: 'Closed the dialog',
  skipped: 'Tapped Skip for now',
  tab_closed: 'Closed or left the page',
};

/** The number's steps, oldest first, in staff words. */
export function attemptSteps(a: PhoneAttempt): Array<{ at: string; text: string; failed: boolean }> {
  return (a.events ?? []).map((e) => {
    const failed = e.e === 'failed';
    const reason = failed && e.c ? attemptErrorLabel({ last_error_code: e.c, last_error_message: null }) : null;
    return { at: e.at, text: reason ? `Failed: ${reason}` : STEP_WORDS[e.e] ?? e.e, failed };
  });
}

/** Clock time in India, "5:53 pm, 16 Oct". */
export function stepTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });
}

/** The alert text for one person (bell and phone push). */
export function stuckAlertText(person: { name: string | null; attempts: PhoneAttempt[] }): { title: string; body: string } {
  const d = diagnosePerson(person.attempts);
  const a = d.attempt ?? person.attempts[0];
  const who = person.name || 'A visitor';
  const where = a ? attemptPlace(a.source, a.source_app) : null;
  const phone = a ? formatAttemptPhone(a.phone) : '';
  return {
    title: `Stuck at phone sign-in: ${STUCK_KIND_LABEL[d.kind]}`,
    body: [`${who}, ${phone}`, where, d.reason].filter(Boolean).join('. ') + '.',
  };
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
