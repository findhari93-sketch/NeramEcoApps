/**
 * The share message, as data.
 *
 * A teacher sharing a class needs the same facts in two shapes: plain text for
 * the clipboard and HTML for a Teams card. Writing that twice guarantees they
 * drift, and the one that drifts is always the one nobody looks at. So this
 * module produces ONE ordered list of sections and class-share-render.ts turns
 * it into either shape.
 *
 * Everything state-dependent lives here ("What we will cover" against "What we
 * covered", "Before you join" against "Class test"). The renderers know nothing
 * about upcoming or past.
 *
 * Pure and client-safe: no fetch, no Supabase, no Graph.
 */

import { classShareLinks } from '@/lib/class-share-links';

export type ClassShareState = 'upcoming' | 'past' | 'cancelled';

export type ShareSectionId =
  | 'header'
  | 'description'
  | 'join'
  | 'recording'
  | 'tests'
  | 'assignments'
  | 'footer';

/** Sections the teacher may switch off. Header and footer are always in. */
export const TOGGLEABLE_SECTIONS: ShareSectionId[] = [
  'description',
  'join',
  'recording',
  'tests',
  'assignments',
];

export interface ShareLine {
  /** Rendered verbatim by both renderers, ahead of the text. */
  emoji?: string;
  /**
   * The words. NEVER pre-escaped: the HTML renderer owns escaping, and a string
   * escaped twice shows a student `&amp;lt;` in a class announcement.
   */
  text: string;
  /** Turns the line into a link. Validated https, see safeUrl below. */
  url?: string;
  /** "• " in text, <li> in HTML. Consecutive bullets collapse into one list. */
  bullet?: boolean;
  /** <strong> in HTML, unchanged in text. */
  strong?: boolean;
  /** A quiet aside under the line it follows. Never a bullet, never a link. */
  muted?: boolean;
}

export interface ShareSection {
  id: ShareSectionId;
  heading?: { emoji: string; text: string };
  lines: ShareLine[];
  /** False for header and footer: only toggleable sections get a checkbox. */
  toggleable: boolean;
  /** Checkbox label, e.g. "Assignments (2)". Absent when not toggleable. */
  checkboxLabel?: string;
}

export interface ShareAssignment {
  id: string;
  title: string;
  timing: 'prework' | 'homework';
  dueAtIso: string | null;
  type: 'drawing' | 'document';
  url: string;
}

export interface ShareTestInfo {
  title?: string | null;
  questionCount: number | null;
  passingPct: number | null;
}

/** How a past class's recording was resolved. See the ladder in the share route. */
export type WatchKind = 'recap' | 'catchup' | 'none';

export interface ClassSharePayload {
  classId: string;
  title: string;
  /** YYYY-MM-DD */
  scheduled_date: string;
  /** HH:MM or HH:MM:SS, IST wall clock. */
  start_time: string;
  end_time: string;
  state: ClassShareState;
  tutorName: string | null;
  description: string | null;
  summaryBullets: string[];
  links: {
    join: string | null;
    rsvp: string | null;
    watch: string | null;
    watchKind: WatchKind;
    prepTest: string | null;
    classTest: string | null;
  };
  prepTest: ShareTestInfo | null;
  classTest: ShareTestInfo | null;
  assignments: ShareAssignment[];
}

/**
 * What GET /api/timetable/[classId]/share returns.
 *
 * Lives here rather than in the route because a Next.js route.ts may only
 * export HTTP handlers, so the dialog cannot import a type from it.
 */
export interface ClassShareResponse extends ClassSharePayload {
  teams: { hasChannel: boolean; hasGroupChat: boolean };
  /** Student surfaces this message links at that are switched off right now. */
  flagWarnings: Array<{ featureId: string; label: string }>;
  /** A past class has a recap, but the students cannot open it yet. */
  recapPending: boolean;
  /** When Share last reached Teams, so a second tap is a decision. */
  lastPostedAt: string | null;
}

/**
 * Clamps. Graph refuses an oversized chatMessage body, and a wall of text in a
 * class channel is not read either way. The bullet cap matches buildWrapUpHtml,
 * so the share card and the wrap-up card say the same amount.
 */
export const MAX_DESCRIPTION_CHARS = 600;
export const MAX_BULLETS = 6;
export const MAX_ASSIGNMENTS = 10;

/** IST class end, as milliseconds. The +05:30 is load-bearing (see prework.ts). */
export function classEndMs(scheduled_date: string, end_time: string): number {
  const raw = (end_time || '00:00').slice(0, 8);
  const time = raw.length === 5 ? `${raw}:00` : raw;
  return Date.parse(`${scheduled_date.slice(0, 10)}T${time}+05:30`);
}

/**
 * Upcoming, past or cancelled, decided in IST.
 *
 * A class whose end time has passed is historical even when its stored status
 * was never flipped to 'completed': that transition depends on a Teams sync
 * that can lag or never run, so time is the honest signal. This is the same
 * rule ClassDetailPanel applies, except it runs on the server, because the
 * template a teacher gets must not depend on their phone's clock.
 */
export function resolveClassState(
  cls: { scheduled_date: string; end_time: string; status: string | null },
  nowMs: number,
): ClassShareState {
  if (cls.status === 'cancelled') return 'cancelled';
  const endMs = classEndMs(cls.scheduled_date, cls.end_time);
  if (!Number.isNaN(endMs) && nowMs > endMs) return 'past';
  if (cls.status === 'completed') return 'past';
  return 'upcoming';
}

/** "18:30" or "18:30:00" -> "6:30 PM" */
export function formatShareTime(time: string): string {
  const [h, m] = (time || '').split(':');
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return time;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${(m ?? '00').padStart(2, '0')} ${ampm}`;
}

/** "2026-07-24" -> "Fri, 24 Jul 2026" (IST) */
export function formatShareDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/** An assignment deadline, in the same IST voice as the class date. */
function formatDue(iso: string | null, timing: 'prework' | 'homework'): string | null {
  if (!iso) return timing === 'prework' ? 'due before class' : null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
  // en-IN renders "6:00 pm" in lower case while the header line says "7:00 PM".
  // Two casings for the same clock in one message reads as a bug to a student.
  const time = d
    .toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
  return `due ${date}, ${time}`;
}

/**
 * Only http(s) survives.
 *
 * These URLs come from the database and are pasted into a Teams card that every
 * student in the class can tap, so a `javascript:` or `data:` value stored by
 * any earlier write must not become a live link. A quote or angle bracket would
 * also break out of the href attribute, so those are refused rather than
 * escaped: a mangled link is worse than a missing one.
 */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (/["'<>\s]/.test(trimmed)) return null;
  return trimmed;
}

/** Trim to a character budget without cutting mid-word where avoidable. */
function clampText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

/** "6 questions, pass at 70%", degrading gracefully when either number is absent. */
function describeTest(info: ShareTestInfo): string {
  const parts: string[] = [];
  if (info.questionCount != null && info.questionCount > 0) {
    parts.push(`${info.questionCount} question${info.questionCount === 1 ? '' : 's'}`);
  }
  if (info.passingPct != null && info.passingPct > 0) {
    parts.push(`pass at ${info.passingPct}%`);
  }
  return parts.length ? parts.join(', ') : 'Open the test';
}

/**
 * Build every section this class HAS. Sections with nothing in them are never
 * produced: the dialog draws its checkbox list from this same array, and a
 * checkbox for "Assignments (0)" is a promise the message cannot keep.
 */
export function buildShareSections(payload: ClassSharePayload): ShareSection[] {
  if (payload.state === 'cancelled') return [];

  const past = payload.state === 'past';
  const sections: ShareSection[] = [];

  // ─── Header. Always in, never toggleable. ───
  const headerLines: ShareLine[] = [
    { emoji: '🗓️', text: formatShareDate(payload.scheduled_date) },
    {
      emoji: '⏰',
      text: `${formatShareTime(payload.start_time)} to ${formatShareTime(payload.end_time)} (IST)`,
    },
  ];
  const tutor = (payload.tutorName || '').trim();
  if (tutor) headerLines.push({ emoji: '👩‍🏫', text: `Tutor: ${tutor}` });

  sections.push({
    id: 'header',
    heading: {
      emoji: past ? '✅' : '📢',
      text: `${past ? 'Class done' : 'Class'}: ${payload.title.trim()}`,
    },
    lines: headerLines,
    toggleable: false,
  });

  // ─── What we covered / will cover ───
  const desc = (payload.description || '').trim();
  const bullets = payload.summaryBullets
    .map((b) => String(b ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_BULLETS);

  if (desc || bullets.length) {
    const lines: ShareLine[] = [];
    if (desc) lines.push({ text: clampText(desc, MAX_DESCRIPTION_CHARS) });
    bullets.forEach((b) => lines.push({ text: clampText(b, 200), bullet: true }));
    sections.push({
      id: 'description',
      heading: { emoji: '📝', text: past ? 'What we covered' : 'What we will cover' },
      lines,
      toggleable: true,
      checkboxLabel: past ? 'What we covered' : 'What we will cover',
    });
  }

  // ─── Join + RSVP. Upcoming only. ───
  if (!past) {
    const join = safeUrl(payload.links.join);
    const rsvp = safeUrl(payload.links.rsvp);
    const lines: ShareLine[] = [];
    if (join) lines.push({ emoji: '🔗', text: 'Join on Teams', url: join });
    if (rsvp) {
      lines.push({ emoji: '✋', text: "Can't make it? Tap to RSVP", url: rsvp });
      lines.push({ text: 'You are marked attending by default.', muted: true });
    }
    if (lines.length) {
      sections.push({ id: 'join', lines, toggleable: true, checkboxLabel: 'Join and RSVP links' });
    }
  }

  // ─── Recording. Past only. ───
  if (past) {
    const watch = safeUrl(payload.links.watch);
    if (watch) {
      const viaRecap = payload.links.watchKind === 'recap';
      sections.push({
        id: 'recording',
        lines: [
          { emoji: '▶️', text: 'Watch the recording', url: watch },
          {
            text: viaRecap
              ? 'Opens in Nexus. Your progress is saved.'
              : 'Opens your catch-up page in Nexus.',
            muted: true,
          },
        ],
        toggleable: true,
        checkboxLabel: 'Recording',
      });
    }
  }

  // ─── Test. The prep test before, the catch-up test after. ───
  const testInfo = past ? payload.classTest : payload.prepTest;
  const testUrl = safeUrl(past ? payload.links.classTest : payload.links.prepTest);
  if (testInfo && testUrl) {
    sections.push({
      id: 'tests',
      heading: { emoji: '🧪', text: past ? 'Class test' : 'Before you join' },
      lines: [{ text: describeTest(testInfo), url: testUrl, bullet: true }],
      toggleable: true,
      checkboxLabel: past ? 'Class test' : 'Prep test',
    });
  }

  // ─── Assignments. Prework before the class, homework after. ───
  const relevant = payload.assignments.filter((a) => (past ? true : a.timing === 'prework'));
  if (relevant.length) {
    const shown = relevant.slice(0, MAX_ASSIGNMENTS);
    const lines: ShareLine[] = shown.map((a) => {
      const due = formatDue(a.dueAtIso, a.timing);
      const bits = [a.title.trim(), `(${a.type})`, due].filter(Boolean);
      return { text: bits.join(' '), url: safeUrl(a.url) ?? undefined, bullet: true };
    });
    const hidden = relevant.length - shown.length;
    if (hidden > 0) {
      lines.push({ text: `and ${hidden} more in Nexus`, bullet: true });
    }
    sections.push({
      id: 'assignments',
      heading: { emoji: '📚', text: past ? 'Homework' : 'Work to finish first' },
      lines,
      toggleable: true,
      checkboxLabel: `Assignments (${relevant.length})`,
    });
  }

  // ─── Footer. Always in, never toggleable. ───
  sections.push({
    id: 'footer',
    lines: [{ text: past ? 'Any doubts, ask in the group 👋' : 'See you in class 👋' }],
    toggleable: false,
  });

  return sections;
}

/**
 * Attach the resolved student URLs to a bare assignment row.
 *
 * Lives here rather than in the route so the unit tests can build a payload
 * without a database, and so there is exactly one place that decides an
 * unrecognised assignment_type reads as a document.
 */
export function toShareAssignment(
  row: {
    id: string;
    title: string | null;
    timing?: string | null;
    due_at?: string | null;
    assignment_type?: string | null;
  },
  base: string,
): ShareAssignment {
  return {
    id: row.id,
    title: row.title || 'Untitled assignment',
    timing: row.timing === 'prework' ? 'prework' : 'homework',
    dueAtIso: row.due_at ?? null,
    type: row.assignment_type === 'drawing' ? 'drawing' : 'document',
    url: classShareLinks(base).assignment(row.id),
  };
}
