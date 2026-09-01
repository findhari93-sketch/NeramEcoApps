/**
 * The assignment share message, as data.
 *
 * A teacher handing out an assignment needs the same facts in two shapes: plain
 * text for the clipboard and HTML for a Teams card. class-share-model.ts states
 * the reasoning at length and it holds here: writing the two by hand guarantees
 * they drift, and the one that drifts is the one nobody reads.
 *
 * This is the smaller sibling of that module. A class share has toggleable
 * sections because a class carries a recording, a test and homework; an
 * assignment carries one link and one deadline, so there is nothing to compose.
 * What it does have, and a class does not, is the list of students who have not
 * submitted, which appears as names in the clipboard text and as real Teams
 * @mentions in the card.
 *
 * Pure and client-safe: no fetch, no Supabase, no Graph. The share dialog
 * imports it to render the live preview.
 *
 * The Teams HTML renderer deliberately lives NEXT DOOR in
 * assignment-share-html.ts rather than here, because it needs buildMentions and
 * teams-class-announcements.ts imports @neram/database. Importing that from a
 * module the dialog pulls in would drag the Supabase admin client into the
 * browser bundle, which is the exact trap class-share-links.ts warns about. The
 * two renderers still share every formatter below, so the preview a teacher
 * reads cannot disagree with the card the class receives.
 */

import { safeUrl } from '@/lib/class-share-model';

export interface SharePendingStudent {
  id: string;
  name: string;
  /** The AAD object id. Null means they can be named but not @mentioned. */
  oid: string | null;
}

export interface AssignmentSharePayload {
  assignmentId: string;
  title: string;
  assignmentType: 'drawing' | 'document';
  /** ISO instant, or null for an assignment with no deadline. */
  dueAt: string | null;
  evaluationType: 'marks' | 'stars';
  maxMarks: number | null;
  /** Absolute short link, /a/<slug>. */
  shareUrl: string;
  /** Everyone in the "Not submitted" bucket, already ordered by name. */
  pending: SharePendingStudent[];
  submittedCount: number;
  totalCount: number;
}

/**
 * What GET /api/assignments/[id]/share returns.
 *
 * Lives here rather than in the route because a Next.js route.ts may only
 * export HTTP handlers, so the dialog could not import a type from it. Same
 * reasoning, and the same home, as ClassShareResponse.
 */
export interface AssignmentShareResponse extends AssignmentSharePayload {
  teams: { hasChannel: boolean; hasGroupChat: boolean };
  /** A draft is invisible to students, so its link would lead to an empty page. */
  isDraft: boolean;
  /** When Share last reached Teams, so a second tap is a decision. */
  lastPostedAt: string | null;
  /** Pending students with no Microsoft account: named in bold, never tagged. */
  unmentionableCount: number;
}

export interface AssignmentShareOptions {
  /**
   * Name the students who have not submitted. Drives the clipboard text and,
   * for the Teams card, whether they are @mentioned.
   */
  includeNames: boolean;
}

/**
 * How many students get named or mentioned before the list becomes "and N more".
 *
 * Graph rejects an oversized chatMessage body, and thirty-plus mentions in one
 * card is not read by anybody: it reads as spam and trains the class to ignore
 * the channel. A message that names the first thirty and counts the rest still
 * does the job of "this is aimed at you".
 */
export const MAX_NAMED = 30;

/** The pending students this message will actually name, and how many it will not. */
export function splitPending(pending: SharePendingStudent[]): {
  named: SharePendingStudent[];
  extra: number;
} {
  const named = pending.slice(0, MAX_NAMED);
  return { named, extra: Math.max(0, pending.length - named.length) };
}

/**
 * A due date the way a student reads one.
 *
 * Asia/Kolkata is pinned for the same reason every other formatter in this app
 * pins it: due_at is stored as an instant with an IST offset, so formatting it
 * in the runtime's zone would show the previous day on any server west of
 * India, which is all of them.
 */
export function formatShareDue(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  // en-IN renders "11:59 pm" lower case. The class share fixed the same thing
  // for the same reason: two casings for one clock reads as a bug.
  const time = d
    .toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
  return `${date}, ${time} IST`;
}

/** "Marked out of 20" / "Graded 1 to 5 stars", or nothing when neither applies. */
export function formatShareGrading(
  evaluationType: 'marks' | 'stars',
  maxMarks: number | null,
): string | null {
  if (evaluationType === 'stars') return 'Graded 1 to 5 stars';
  return maxMarks ? `Marked out of ${maxMarks}` : null;
}

function typeIcon(assignmentType: 'drawing' | 'document'): string {
  return assignmentType === 'drawing' ? '🎨' : '📝';
}

/** The header line, shared by both renderers so the two cannot describe it differently. */
export function headline(p: AssignmentSharePayload): string {
  return `${typeIcon(p.assignmentType)} Assignment: ${p.title.trim()}`;
}

/** "Due: ... · Graded 1 to 5 stars", collapsing gracefully when either is absent. */
export function metaLine(p: AssignmentSharePayload): string | null {
  const due = formatShareDue(p.dueAt);
  const grading = formatShareGrading(p.evaluationType, p.maxMarks);
  const bits = [due ? `Due: ${due}` : null, grading].filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}

/**
 * Whether this message names anybody.
 *
 * Two separate reasons it might not, and both must suppress the whole block
 * rather than leave a heading with nothing under it: the teacher switched names
 * off, or everybody has already submitted. The second one matters more than it
 * looks: a "Still to submit (0):" line followed by nothing is the kind of
 * detail that makes a class stop trusting these messages.
 */
export function willName(p: AssignmentSharePayload, opts: AssignmentShareOptions): boolean {
  return opts.includeNames && p.pending.length > 0;
}

/** The closing line. Past the deadline, "before the deadline" is nonsense. */
export function closingLine(p: AssignmentSharePayload): string {
  const due = p.dueAt ? Date.parse(p.dueAt) : NaN;
  const overdue = !Number.isNaN(due) && due < Date.now();
  if (overdue) return 'This is past its deadline. Please submit it as soon as you can.';
  return p.dueAt
    ? 'Please complete it before the deadline.'
    : 'Please complete it and upload your work.';
}

/**
 * The clipboard shape: plain text a teacher can paste anywhere.
 *
 * Deliberately carries the URL as its own line rather than as any kind of
 * markup. This string goes into WhatsApp, a Teams compose box, an SMS and a
 * notes app, and the only link format all of them detect is a bare URL.
 */
export function renderAssignmentShareText(
  p: AssignmentSharePayload,
  opts: AssignmentShareOptions,
): string {
  const lines: string[] = [headline(p)];

  const meta = metaLine(p);
  if (meta) lines.push(meta);

  if (willName(p, opts)) {
    const { named, extra } = splitPending(p.pending);
    const names = named.map((s) => s.name).join(', ');
    lines.push('');
    lines.push(
      `Still to submit (${p.pending.length}): ${names}${extra > 0 ? `, and ${extra} more` : ''}`,
    );
  }

  const url = safeUrl(p.shareUrl);
  if (url) {
    lines.push('');
    lines.push(`Open it here: ${url}`);
  }

  lines.push('');
  lines.push(closingLine(p));

  return lines.join('\n');
}
