/**
 * Pure helpers for the learner review page and the private feedback form
 * (lifecycle plan M6). No Supabase, no browser APIs: shared by the client
 * components and the API routes, and unit tested.
 */

// ── Age and consent ────────────────────────────────────────────────────────

/** Whole years between a date of birth (YYYY-MM-DD or ISO) and `now`. Null when unknown or invalid. */
export function ageInYears(dateOfBirth: string | null | undefined, now: Date = new Date()): number | null {
  if (!dateOfBirth || typeof dateOfBirth !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let age = now.getFullYear() - year;
  const beforeBirthday = now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day);
  if (beforeBirthday) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

/**
 * Under 18 for consent purposes. An unknown or invalid date of birth counts as
 * under 18, so a guardian's agreement is asked for rather than assumed.
 */
export function isMinorFromDob(dateOfBirth: string | null | undefined, now: Date = new Date()): boolean {
  const age = ageInYears(dateOfBirth, now);
  return age === null || age < 18;
}

// ── Rate limit ─────────────────────────────────────────────────────────────

export const TESTIMONIAL_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When the next learner review may be sent, or null when one can be sent now. */
export function nextTestimonialAllowedAt(lastSubmittedAt: string | null | undefined, now: Date = new Date()): Date | null {
  if (!lastSubmittedAt) return null;
  const last = new Date(lastSubmittedAt);
  if (Number.isNaN(last.getTime())) return null;
  const next = new Date(last.getTime() + TESTIMONIAL_COOLDOWN_DAYS * DAY_MS);
  return next.getTime() > now.getTime() ? next : null;
}

/** "12 Oct 2026" in India time, for the rate limit message. */
export function formatReviewDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** Suggested public name: first name plus last initial ("Priya S."). */
export function suggestDisplayName(user: { first_name?: string | null; last_name?: string | null; name?: string | null } | null): string {
  if (!user) return '';
  const first = (user.first_name || '').trim();
  const last = (user.last_name || '').trim();
  if (first) return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
  const parts = (user.name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : parts[0];
}

// ── Private feedback topics ────────────────────────────────────────────────

export const FEEDBACK_TOPICS = [
  { slug: 'ui_ux', label: 'UI and UX' },
  { slug: 'performance', label: 'Performance' },
  { slug: 'content', label: 'Content' },
  { slug: 'teaching', label: 'Teaching' },
  { slug: 'tools', label: 'Tools' },
  { slug: 'calculator', label: 'Calculator' },
  { slug: 'college_predictor', label: 'College Predictor' },
  { slug: 'mock_tests', label: 'Mock Tests' },
  { slug: 'communication', label: 'Communication' },
  { slug: 'support', label: 'Support' },
  { slug: 'pricing', label: 'Pricing' },
  { slug: 'application_process', label: 'Application Process' },
  { slug: 'sign_in', label: 'Sign-in' },
  { slug: 'other', label: 'Other' },
] as const;

export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number]['slug'];

const TOPIC_SLUGS: ReadonlySet<string> = new Set(FEEDBACK_TOPICS.map((t) => t.slug));

export function isFeedbackTopic(value: unknown): value is FeedbackTopic {
  return typeof value === 'string' && TOPIC_SLUGS.has(value);
}

/**
 * Validate the optional topics list. Missing means none. Anything that is not
 * an array of known slugs is refused (the caller answers 400); duplicates are
 * removed and the order follows FEEDBACK_TOPICS.
 */
export function parseFeedbackTopics(input: unknown): { ok: true; topics: FeedbackTopic[] } | { ok: false; invalid: unknown[] } {
  if (input === undefined || input === null) return { ok: true, topics: [] };
  if (!Array.isArray(input)) return { ok: false, invalid: [input] };
  const invalid = input.filter((v) => !isFeedbackTopic(v));
  if (invalid.length > 0) return { ok: false, invalid };
  const chosen = new Set(input as string[]);
  return { ok: true, topics: FEEDBACK_TOPICS.filter((t) => chosen.has(t.slug)).map((t) => t.slug) };
}
