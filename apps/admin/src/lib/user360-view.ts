/**
 * Pure helpers for the admin User 360 screen (/crm/[id]).
 *
 * No React here so the rules (which tab a link opens, how a timeline row is
 * labelled, how "last active" reads) are unit tested in user360-view.test.ts.
 */

export const USER360_TABS = [
  'overview',
  'activity',
  'journey',
  'enrollment',
  'access',
  'crm',
  'feedback',
  'audit',
] as const;

export type User360Tab = (typeof USER360_TABS)[number];

export const USER360_TAB_LABELS: Record<User360Tab, string> = {
  overview: 'Overview',
  activity: 'Activity',
  journey: 'Journey',
  enrollment: 'Enrollment',
  access: 'Access',
  crm: 'CRM',
  feedback: 'Feedback',
  audit: 'Audit',
};

/**
 * Older deep links (notification bell) point at a section id:
 * /crm/[id]?section=callbacks. Each section now lives in one tab.
 */
export const SECTION_TO_TAB: Record<string, User360Tab> = {
  profile: 'overview',
  application: 'journey',
  scholarship: 'journey',
  payment: 'journey',
  refund: 'journey',
  'score-calculations': 'journey',
  onboarding: 'enrollment',
  documents: 'enrollment',
  credentials: 'access',
  diagnostics: 'access',
  'auto-messages': 'crm',
  demo: 'crm',
  callbacks: 'crm',
  notes: 'crm',
  owner: 'crm',
  history: 'audit',
};

/** The tab to show: an explicit ?tab= wins, then a legacy ?section=, else Overview. */
export function resolveUser360Tab(tab: string | null | undefined, section?: string | null): User360Tab {
  if (tab && (USER360_TABS as readonly string[]).includes(tab)) return tab as User360Tab;
  if (section && SECTION_TO_TAB[section]) return SECTION_TO_TAB[section];
  return 'overview';
}

/** Pages that link into User 360 and where Back returns to. */
export const BACK_TARGETS: Record<string, { href: string; label: string }> = {
  crm: { href: '/crm', label: 'Back to Users' },
  leads: { href: '/leads', label: 'Back to Leads' },
  duplicates: { href: '/duplicates', label: 'Back to Duplicates' },
  'follow-ups': { href: '/follow-ups', label: 'Back to Follow-ups' },
  lifecycle: { href: '/lifecycle', label: 'Back to Lifecycle' },
  testimonials: { href: '/testimonials', label: 'Back to Testimonials' },
  students: { href: '/students', label: 'Back to Students' },
};

export function resolveBackTarget(from: string | null | undefined): { href: string; label: string } {
  return (from && BACK_TARGETS[from]) || BACK_TARGETS.crm;
}

/** Query string for a tab change, keeping `from` so Back still returns to the right list. */
export function buildTabQuery(tab: User360Tab, from: string | null | undefined): string {
  const params = new URLSearchParams();
  params.set('tab', tab);
  if (from && BACK_TARGETS[from]) params.set('from', from);
  return `?${params.toString()}`;
}

// ── Timeline ────────────────────────────────────────────────────────────────

export type TimelineTone = 'primary' | 'success' | 'error' | 'warning' | 'info' | 'neutral';

export interface TimelineKindMeta {
  /** Short word shown next to the icon, so the icon is never the only signal. */
  label: string;
  tone: TimelineTone;
}

export const TIMELINE_KIND_META: Record<string, TimelineKindMeta> = {
  event: { label: 'Activity', tone: 'primary' },
  sign_in: { label: 'Sign in', tone: 'info' },
  payment: { label: 'Payment', tone: 'success' },
  demo: { label: 'Demo', tone: 'info' },
  change: { label: 'Change', tone: 'neutral' },
  note: { label: 'Note', tone: 'warning' },
  call: { label: 'Call', tone: 'primary' },
  message: { label: 'Message', tone: 'info' },
  enrollment: { label: 'Enrollment', tone: 'success' },
  classification: { label: 'Status', tone: 'neutral' },
  feedback: { label: 'Feedback', tone: 'warning' },
  merge: { label: 'Merge', tone: 'neutral' },
  account: { label: 'Account', tone: 'primary' },
};

export function timelineKindMeta(kind: string | null | undefined, title?: string | null): TimelineKindMeta {
  const meta = (kind && TIMELINE_KIND_META[kind]) || { label: 'Other', tone: 'neutral' as TimelineTone };
  if (kind === 'payment' && title && /failed/i.test(title)) return { ...meta, tone: 'error' };
  if (kind === 'payment' && title && /refund/i.test(title)) return { ...meta, tone: 'warning' };
  return meta;
}

const SOURCE_APP_LABELS: Record<string, string> = {
  marketing: 'Website',
  app: 'Student app',
  nexus: 'Nexus',
  admin: 'Admin',
  tools: 'Tools',
};

export function sourceAppLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  return SOURCE_APP_LABELS[source] || sentenceCase(source);
}

export function sentenceCase(raw: string): string {
  const s = raw.replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Funnel event names arrive as snake_case identifiers; everything else is already plain English. */
export function timelineTitle(kind: string, title: string | null | undefined): string {
  if (!title) return timelineKindMeta(kind).label;
  return kind === 'event' ? sentenceCase(title) : title;
}

function formatRupees(amount: unknown): string | null {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return `₹${n.toLocaleString('en-IN')}`;
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'empty';
  // user_profile_history stores values JSON encoded ("\"malayalam\"", "true").
  if (typeof v === 'string' && /^["{[]|^(true|false|null)$/.test(v)) {
    try {
      return show(JSON.parse(v));
    } catch {
      /* not JSON, show as is */
    }
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if ('value' in obj) return show(obj.value);
    return JSON.stringify(v).slice(0, 80);
  }
  return String(v).slice(0, 80);
}

/**
 * getUser360 can hand back `person: []` for someone outside user_lifecycle_view
 * (staff): its maybeSingle read turns a missing row into an empty array, which
 * then skips the users-row fallback. Use the users row from the CRM detail
 * payload instead so the page still has a name, email and id.
 */
export function normalizePerson(
  person: unknown,
  fallbackUser: Record<string, any> | null | undefined,
  userId: string,
): Record<string, any> {
  const usable = person && typeof person === 'object' && !Array.isArray(person) && (person as any).id;
  if (usable) return person as Record<string, any>;
  return { ...(fallbackUser || {}), id: fallbackUser?.id || userId };
}

/** One short line under the title. Null when there is nothing worth showing. */
export function timelineDetailLine(kind: string, detail: Record<string, unknown> | null | undefined): string | null {
  if (!detail) return null;
  const d = detail as Record<string, any>;
  const parts: string[] = [];
  switch (kind) {
    case 'payment': {
      const amount = formatRupees(d.amount);
      if (amount) parts.push(amount);
      if (d.method) parts.push(sentenceCase(String(d.method)));
      if (d.installment) parts.push(`Instalment ${d.installment}`);
      if (d.receipt) parts.push(`Receipt ${d.receipt}`);
      break;
    }
    case 'change':
      if ('from' in d || 'to' in d) parts.push(`${show(d.from)} to ${show(d.to)}`);
      break;
    case 'note':
      if (d.note) parts.push(String(d.note));
      break;
    case 'demo':
      if (d.status) parts.push(sentenceCase(String(d.status)));
      if (d.attended === true) parts.push('Attended');
      break;
    case 'enrollment':
      if (d.classroom) parts.push(String(d.classroom));
      if (d.reason) parts.push(sentenceCase(String(d.reason)));
      if (d.notes) parts.push(String(d.notes));
      break;
    case 'classification':
      if (d.reason) parts.push(String(d.reason));
      break;
    case 'feedback':
      if (d.category) parts.push(sentenceCase(String(d.category)));
      if (d.text) parts.push(String(d.text));
      break;
    case 'merge':
      if (d.merged_name) parts.push(String(d.merged_name));
      if (d.merged_email) parts.push(String(d.merged_email));
      break;
    case 'account':
      if (d.source) parts.push(`Came from ${d.source}`);
      if (d.landing_page) parts.push(String(d.landing_page));
      break;
    case 'sign_in':
      if (d.outcome && d.outcome !== 'success') parts.push(sentenceCase(String(d.outcome)));
      break;
    case 'message':
      if (d.template) parts.push(String(d.template));
      break;
    case 'event':
      if (d.status && d.status !== 'completed') parts.push(sentenceCase(String(d.status)));
      if (d.error) parts.push(`Error ${d.error}`);
      if (d.page) parts.push(String(d.page));
      break;
    default:
      break;
  }
  const line = parts.filter(Boolean).join(' · ');
  return line || null;
}

// ── Dates ───────────────────────────────────────────────────────────────────

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = now.getTime() - t;
  if (diff < 0) {
    const ahead = -diff;
    if (ahead < HOUR) return 'in under an hour';
    if (ahead < DAY) return `in ${Math.round(ahead / HOUR)} h`;
    const days = Math.round(ahead / DAY);
    return days === 1 ? 'tomorrow' : `in ${days} days`;
  }
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years <= 1 ? '1 year ago' : `${years} years ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/** "3 days ago, Opened Nexus" or "No recorded activity". */
export function lastActiveText(
  at: string | null | undefined,
  source: string | null | undefined,
  sourceLabels: Record<string, string>,
  now: Date = new Date(),
): string {
  const rel = relativeTime(at, now);
  if (!rel) return 'No recorded activity';
  const label = source ? sourceLabels[source] || sentenceCase(source) : null;
  return label ? `${rel}, ${label}` : rel;
}

// ── Access and follow-ups ───────────────────────────────────────────────────

export const NEXUS_ACCESS_TEXT: Record<string, { label: string; meaning: string; tone: TimelineTone }> = {
  enrolled: { label: 'Has Nexus access', meaning: 'Enrolled in a live classroom and has opened Nexus.', tone: 'success' },
  not_started: {
    label: 'Not started',
    meaning: 'Enrolled in a classroom but has never opened Nexus.',
    tone: 'warning',
  },
  alumni: { label: 'Alumni', meaning: 'Graduated. Nexus access has ended.', tone: 'neutral' },
  none: { label: 'No Nexus access', meaning: 'Not enrolled in a live classroom, or the account is deactivated.', tone: 'neutral' },
};

export function nexusAccessText(state: string | null | undefined) {
  return (state && NEXUS_ACCESS_TEXT[state]) || NEXUS_ACCESS_TEXT.none;
}

export function isOverdue(dueAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  const t = new Date(dueAt).getTime();
  return !Number.isNaN(t) && t < now.getTime();
}

export const SUGGESTION_LABELS: Record<string, string> = {
  check_in_student: 'Check in with this student',
  archive_lead: 'Archive this lead',
  deactivate_account: 'Deactivate this account',
  graduate_student: 'Graduate this student',
};

export function suggestionLabel(kind: string | null | undefined): string {
  if (!kind) return 'Suggestion';
  return SUGGESTION_LABELS[kind] || sentenceCase(kind);
}

export const IDENTITY_PROVIDER_LABELS: Record<string, string> = {
  firebase: 'Student app sign-in (Google or phone)',
  microsoft: 'Microsoft (Nexus) account',
};
