/**
 * Pure helpers for the lifecycle plan's Nexus screens (M4 User 360, M6 learner
 * testimonials). No React, no Supabase: the routes and the components both use
 * them, and they are unit tested in lifecycle-display.test.ts.
 */

// ── Age ────────────────────────────────────────────────────────────────────

/**
 * Is this person under 18 on `now`?
 *
 * An unknown or unreadable date of birth counts as a minor. The only thing this
 * decides is whether a parent or guardian must agree before a review can be
 * shown publicly, and asking for that consent from an adult costs one checkbox,
 * while skipping it for a child is the mistake we cannot make.
 */
export function isMinorOn(dateOfBirth: string | null | undefined, now: Date = new Date()): boolean {
  if (!dateOfBirth) return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateOfBirth).trim());
  if (!m) return true;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return true;

  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  let age = y - year;
  if (mo < month || (mo === month && d < day)) age -= 1;
  // A date in the future is a typo, not a newborn adult.
  if (age < 0) return true;
  return age < 18;
}

// ── Learner testimonial rate limit ─────────────────────────────────────────

export const TESTIMONIAL_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When the learner may write again, or null when they may write now. */
export function nextTestimonialAllowedAt(
  lastSubmittedAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!lastSubmittedAt) return null;
  const last = Date.parse(lastSubmittedAt);
  if (Number.isNaN(last)) return null;
  const next = last + TESTIMONIAL_COOLDOWN_DAYS * DAY_MS;
  return next > now.getTime() ? new Date(next).toISOString() : null;
}

// ── Relative time ──────────────────────────────────────────────────────────

/** "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", "2 months ago". */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'Not recorded';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'Not recorded';
  const diff = now.getTime() - t;
  if (diff < 0) return 'just now';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years <= 1 ? '1 year ago' : `${years} years ago`;
}

// ── Activity timeline ──────────────────────────────────────────────────────

/**
 * The icon family a timeline row uses. The component maps each to one SVG icon;
 * keeping the mapping here means a new `kind` from get_user_timeline lands on a
 * sensible icon instead of a blank.
 */
export type ActivityIcon =
  | 'sign_in'
  | 'payment'
  | 'demo'
  | 'change'
  | 'note'
  | 'call'
  | 'message'
  | 'enrollment'
  | 'classification'
  | 'feedback'
  | 'merge'
  | 'account'
  | 'tool'
  | 'application'
  | 'event';

export interface ActivityKindInfo {
  icon: ActivityIcon;
  /** Spoken with the row, so the icon is never the only signal. */
  label: string;
}

const KIND_INFO: Record<string, ActivityKindInfo> = {
  sign_in: { icon: 'sign_in', label: 'Sign in' },
  payment: { icon: 'payment', label: 'Payment' },
  demo: { icon: 'demo', label: 'Demo class' },
  change: { icon: 'change', label: 'Profile change' },
  note: { icon: 'note', label: 'Staff note' },
  call: { icon: 'call', label: 'Call' },
  message: { icon: 'message', label: 'Message' },
  enrollment: { icon: 'enrollment', label: 'Classroom' },
  classification: { icon: 'classification', label: 'Classification' },
  feedback: { icon: 'feedback', label: 'Feedback' },
  merge: { icon: 'merge', label: 'Record merged' },
  account: { icon: 'account', label: 'Account' },
};

/** Icon and label for a timeline row. `event` rows are refined by their event name. */
export function activityKindInfo(kind: string | null | undefined, eventName?: string | null): ActivityKindInfo {
  if (kind === 'event') {
    const name = eventName ?? '';
    if (name.startsWith('tool_')) return { icon: 'tool', label: 'Tool' };
    if (name.startsWith('payment_')) return { icon: 'payment', label: 'Payment' };
    if (name.startsWith('application_') || name.startsWith('onboarding_')) {
      return { icon: 'application', label: 'Application' };
    }
    if (/(auth|otp|phone|register|signed_in)/.test(name)) return { icon: 'sign_in', label: 'Sign in' };
    if (name.startsWith('review_') || name.startsWith('feedback_')) return { icon: 'feedback', label: 'Feedback' };
    return { icon: 'event', label: 'Activity' };
  }
  return KIND_INFO[kind ?? ''] ?? { icon: 'event', label: 'Activity' };
}

/** "tool_completed" to "Tool completed". */
export function humaniseName(name: string): string {
  const s = name.replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Activity';
}

export interface RawTimelineEntry {
  occurred_at: string;
  kind: string;
  title: string;
  detail: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name?: string | null;
  source_app: string | null;
}

export interface ActivityRow {
  occurred_at: string;
  kind: string;
  /** The raw event name for `event` rows, so the client can pick the icon. */
  event: string | null;
  title: string;
  /** One short line, already worded for people. */
  detail: string | null;
  /** Staff member who did it. Null when the student did it. */
  actor_name: string | null;
  source_app: string | null;
}

const APP_LABELS: Record<string, string> = {
  nexus: 'Nexus',
  admin: 'Admin',
  app: 'Student app',
  marketing: 'Website',
};

export function sourceAppLabel(app: string | null | undefined): string | null {
  if (!app) return null;
  return APP_LABELS[app] ?? humaniseName(app);
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** One human line from a row's detail object. Never money for a caller without the fee capability. */
function detailLine(entry: RawTimelineEntry): string | null {
  const d = entry.detail ?? {};
  switch (entry.kind) {
    case 'enrollment':
      return [str(d.classroom), str(d.reason) && humaniseName(String(d.reason)), str(d.notes)]
        .filter(Boolean)
        .join('. ') || null;
    case 'classification':
    case 'feedback':
      return str(d.reason) ?? str(d.text);
    case 'note':
      return str(d.note);
    case 'change': {
      const from = str(d.from);
      const to = str(d.to);
      if (!from && !to) return null;
      return `${from ?? 'not set'} to ${to ?? 'not set'}`;
    }
    case 'demo':
      return d.attended === true ? 'Attended' : str(d.status) && humaniseName(String(d.status));
    case 'merge':
      return str(d.merged_email) ?? str(d.merged_name);
    case 'account':
      return str(d.source) ? `First came from ${d.source}` : null;
    case 'event':
      return entry.detail && str(d.status) === 'failed' ? 'Did not complete' : null;
    default:
      return null;
  }
}

/**
 * Turn get_user_timeline rows into what the Nexus Activity list shows.
 *
 * THE FEE GATE HOLDS HERE TOO. The student profile promises a teacher's payload
 * never carries money (see api/students/[id]/finance). get_user_timeline returns
 * payment rows with amounts, so for a caller without `coord.student.finance`
 * payment rows and payment events are dropped entirely, the same as the Nexus
 * history section, which only shows payments once the finance fetch succeeded.
 * Admin CRM notes go with them: they are written in the sales conversation and
 * regularly talk about fees, so a teacher sees that a call happened but not the
 * note.
 *
 * Detail objects never leave the server; only the one worded line does.
 */
export function presentTimeline(
  entries: RawTimelineEntry[],
  options: { canSeeFinance: boolean; eventLabels?: Record<string, string> },
): ActivityRow[] {
  const labels = options.eventLabels ?? {};
  const rows: ActivityRow[] = [];
  for (const e of entries) {
    if (!e?.occurred_at) continue;
    const isEvent = e.kind === 'event';
    const eventName = isEvent ? e.title : null;
    const moneyRow = e.kind === 'payment' || (isEvent && (eventName ?? '').startsWith('payment_'));
    if ((moneyRow || e.kind === 'note') && !options.canSeeFinance) continue;

    let detail = detailLine(e);
    if (e.kind === 'payment' && options.canSeeFinance) {
      const amount = Number((e.detail ?? {}).amount);
      detail = Number.isFinite(amount) && amount > 0 ? `Rs ${amount.toLocaleString('en-IN')}` : null;
    }

    rows.push({
      occurred_at: e.occurred_at,
      kind: e.kind,
      event: eventName,
      title: isEvent ? labels[eventName ?? ''] ?? humaniseName(eventName ?? '') : e.title || 'Activity',
      detail: detail ? detail.slice(0, 300) : null,
      actor_name: e.actor_id ? e.actor_name ?? 'A staff member' : null,
      source_app: e.source_app ?? null,
    });
  }
  return rows;
}

// ── Lifecycle facts ────────────────────────────────────────────────────────

/** What GET /api/students/[id]/lifecycle answers. */
export interface StudentLifecyclePayload {
  lifecycle_stage: string | null;
  engagement: string | null;
  last_meaningful_activity_at: string | null;
  last_meaningful_activity_source: string | null;
  target_exams: string[];
  target_year: number | string | null;
  profile_missing: string[];
  openDuplicates: number;
}


const EXAM_LABELS: Record<string, string> = {
  nata: 'NATA',
  NATA: 'NATA',
  jee: 'JEE Paper 2',
  JEE: 'JEE Paper 2',
  jee_paper2: 'JEE Paper 2',
  jee_paper_2: 'JEE Paper 2',
  JEE_PAPER_2: 'JEE Paper 2',
  both: 'NATA and JEE Paper 2',
  BOTH: 'NATA and JEE Paper 2',
};

/** ['nata', 'jee_paper2'] to "NATA, JEE Paper 2". Unknown codes are humanised, duplicates dropped. */
export function formatTargetExams(exams: unknown): string | null {
  const list = Array.isArray(exams) ? exams : typeof exams === 'string' ? [exams] : [];
  const out: string[] = [];
  for (const raw of list) {
    const s = str(raw);
    if (!s) continue;
    const label = EXAM_LABELS[s] ?? humaniseName(s);
    if (!out.includes(label)) out.push(label);
  }
  return out.length ? out.join(', ') : null;
}

// ── Learner testimonial form ───────────────────────────────────────────────

/** "Priya Sharma" to "Priya S.", the shape a public review shows by default. */
export function suggestDisplayName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

/** Exam years the form offers, newest first, inside what validateLearnerTestimonial accepts. */
export function testimonialYearOptions(now: Date = new Date()): number[] {
  const y = now.getFullYear();
  const out: number[] = [];
  for (let year = y + 2; year >= Math.max(2015, y - 6); year -= 1) out.push(year);
  return out;
}
