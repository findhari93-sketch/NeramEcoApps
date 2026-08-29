/**
 * Teams announcement helpers for an assignment.
 *
 * The class counterpart lives in teams-class-announcements.ts. Assignments get
 * their own file rather than a section of that one: it is already ~900 lines and
 * owns the scheduled-class lifecycle (join cards, cancellations, wrap-ups),
 * which an assignment shares none of.
 *
 * Why this exists at all: publishing an assignment used to write a single row
 * into the per-classroom timetable bell and stop there. Students did not find
 * out. A scheduled class announces itself in the Teams group chat and channel;
 * an assignment now does the same.
 *
 * Two deliberate differences from the class cards:
 *
 *  1. The channel is the classroom's `ms_assignment_channel_id`, never the
 *     meeting channel. Unset means the group chat is the only channel, and that
 *     is a valid, silent configuration, NOT a reason to fall back to
 *     resolveMeetingChannelId. Assignment cards must not land in the feed
 *     students read for "am I joining a call right now".
 *  2. There is no prior card to soft-delete. Publishing is the first
 *     announcement for this assignment, the same situation
 *     announceScheduledTestToTeams is in.
 *
 * Every Graph call here is best-effort and never throws: a Teams outage must
 * not roll back the publish that triggered it.
 */

import { escapeHtml } from '@/lib/html-escape';
import { postChannelMessage, postChatMessage } from '@/lib/teams-class-announcements';
import { classShareLinks } from '@/lib/class-share-links';
import { notifyStudents } from '@/lib/notify-students';
import type { getSupabaseAdminClient } from '@neram/database';

type AdminClient = ReturnType<typeof getSupabaseAdminClient>;

const esc = escapeHtml;

/** How much of the teacher's brief rides along in the card before it is clipped. */
const BRIEF_LIMIT = 200;

export interface AssignmentCard {
  title: string;
  assignmentType: 'drawing' | 'document';
  /** ISO instant, or null for an assignment with no deadline. */
  dueAt: string | null;
  evaluationType: 'marks' | 'stars';
  maxMarks: number | null;
  instructions: string | null;
  /** The class this assignment belongs to, when it is attached to one. */
  className?: string | null;
  /** YYYY-MM-DD. Only meaningful alongside className. */
  classDate?: string | null;
  /** Absolute URL to the student's assignment page. */
  assignmentUrl: string;
}

/**
 * Render a due date the way a student reads one.
 *
 * due_at is stored as an instant with an IST offset (`...T23:59:59+05:30`), so
 * formatting it in the runtime's local zone would show the previous day for any
 * server west of India, which is all of them. Asia/Kolkata is pinned for the
 * same reason the rest of this app pins it: the deadline is an IST wall clock.
 */
function formatDue(dueAt: string | null): string {
  if (!dueAt) return 'No deadline set.';
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return 'No deadline set.';
  const label = d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `<strong>Due:</strong> ${esc(label)} IST`;
}

/** A human date for the class line. Falls back to the raw string if unparseable. */
function formatClassDate(date: string | null | undefined): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
}

/** The grading line: "Marked out of 20" or "Graded 1 to 5 stars". */
function formatGrading(evaluationType: 'marks' | 'stars', maxMarks: number | null): string {
  if (evaluationType === 'stars') return 'Graded 1 to 5 stars.';
  return maxMarks ? `Marked out of ${maxMarks}.` : '';
}

/**
 * A one-line taste of the brief, so a student can tell from the card whether
 * this is the drawing they already started. Newlines collapse to spaces:
 * Teams renders the card as HTML, so a raw newline would be swallowed anyway
 * and a multi-paragraph brief would arrive as one unbroken wall.
 */
function formatBrief(instructions: string | null): string {
  const flat = String(instructions ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return '';
  const clipped = flat.length > BRIEF_LIMIT ? `${flat.slice(0, BRIEF_LIMIT).trimEnd()}...` : flat;
  return `<p>${esc(clipped)}</p>`;
}

function typeIcon(assignmentType: 'drawing' | 'document'): string {
  return assignmentType === 'drawing' ? '🎨' : '📝';
}

/**
 * The card posted when an assignment is published.
 *
 * When the assignment is already attached to a class, the heading names it.
 * That is what lets the timetable path ("Create new" inside a class, then
 * publish) produce ONE message that reads as a complete thought, rather than a
 * generic card followed by a separate "by the way, this belongs to Tuesday".
 */
export function buildAssignmentPublishedHtml(a: AssignmentCard): string {
  const classLine = a.className
    ? `<p><strong>From:</strong> ${esc(a.className)}${
        a.classDate ? ` (${esc(formatClassDate(a.classDate))})` : ''
      }</p>`
    : '';
  const grading = formatGrading(a.evaluationType, a.maxMarks);

  return `<h3>${typeIcon(a.assignmentType)} New assignment: ${esc(a.title)}</h3>
${classLine}<p>${formatDue(a.dueAt)}</p>
${formatBrief(a.instructions)}${grading ? `<p>${esc(grading)}</p>` : ''}
<p><a href="${esc(a.assignmentUrl)}">📄 Open the assignment</a></p>
<p>Please complete it before the deadline.</p>`;
}

/**
 * The card posted when an ALREADY PUBLISHED assignment is attached to a class.
 *
 * Distinct wording from the publish card on purpose: students have already seen
 * this assignment announced once, and a second identical card would read as a
 * duplicate rather than as news. What is new is the class it now belongs to.
 */
export function buildAssignmentLinkedHtml(a: AssignmentCard): string {
  return `<h3>🔗 ${esc(a.title)} is now part of ${esc(a.className || 'your class')}</h3>
${a.classDate ? `<p><strong>Class:</strong> ${esc(formatClassDate(a.classDate))}</p>` : ''}<p>${formatDue(a.dueAt)}</p>
<p><a href="${esc(a.assignmentUrl)}">📄 Open the assignment</a></p>
<p>Please complete it before the deadline.</p>`;
}

export interface AnnounceResult {
  channelId: string | null;
  channelMessageId: string | null;
  chatMessageId: string | null;
}

/**
 * Post an assignment card to a classroom's assignment channel and group chat.
 *
 * `token` must be the teacher's DELEGATED Graph token: application tokens
 * cannot send channel messages, which is why the caller passes the request's
 * bearer through rather than reaching for getAppOnlyToken.
 *
 * Returns null when the classroom is wired to neither a usable channel nor a
 * group chat, so the caller can tell "nothing to post to" apart from "posted,
 * and here are the ids". Never throws.
 */
export async function announceAssignmentToTeams(
  token: string,
  supabase: AdminClient,
  classroomId: string,
  html: string,
): Promise<AnnounceResult | null> {
  const { data: classroom } = await (supabase as any)
    .from('nexus_classrooms')
    .select('ms_team_id, ms_group_chat_id, ms_assignment_channel_id')
    .eq('id', classroomId)
    .single();

  if (!classroom) return null;

  const channelId: string | null = classroom.ms_assignment_channel_id || null;
  const teamId: string | null = classroom.ms_team_id || null;
  const chatId: string | null = classroom.ms_group_chat_id || null;

  // A team with no assignment channel chosen is a normal, deliberate state:
  // post to the group chat only. Deliberately NOT resolveMeetingChannelId.
  const canPostChannel = Boolean(teamId && channelId);
  if (!canPostChannel && !chatId) return null;

  let channelMessageId: string | null = null;
  let chatMessageId: string | null = null;

  if (canPostChannel) {
    channelMessageId = await postChannelMessage(token, teamId as string, channelId as string, html);
  }
  if (chatId) {
    chatMessageId = await postChatMessage(token, chatId, html);
  }

  return { channelId: canPostChannel ? channelId : null, channelMessageId, chatMessageId };
}

/**
 * Whether this request's bearer can actually talk to Graph.
 *
 * Impersonation (`imp_`), parent (`par_`) and test (`test_`) tokens are minted
 * by Nexus itself and are not Microsoft tokens, so handing one to Graph is a
 * guaranteed 401. Those sessions still get the in-app notify, which runs on
 * app-level credentials. Same guard as the exams route.
 */
export function canPostToGraph(token: string | null): token is string {
  return Boolean(token) && !/^(test_|imp_|par_)/.test(token as string);
}

/**
 * Whether attaching this assignment to `classId` is news worth announcing.
 *
 * Extracted from the link route so the rule is testable and stated once. Two
 * things it deliberately suppresses:
 *
 *  - A DRAFT. This is what holds the timetable "Create new" path to ONE
 *    message: creating from inside a class links the assignment while it is
 *    still a draft, so this returns false, and the later publish posts a single
 *    card that already names the class. Without this check that path would
 *    announce twice, which is exactly what we were asked to avoid.
 *  - An assignment already announced against this same class, so unlinking and
 *    relinking cannot re-post the card.
 *
 * Moving an assignment to a DIFFERENT class is news, and does announce.
 */
export function shouldAnnounceLink(
  assignment: { status: string; teams_announced_class_id: string | null },
  classId: string,
): boolean {
  if (assignment.status !== 'published') return false;
  return assignment.teams_announced_class_id !== classId;
}

/** The assignment columns an announcement needs. */
export interface AnnounceableAssignment {
  id: string;
  classroom_id: string;
  scheduled_class_id: string | null;
  title: string;
  assignment_type: 'drawing' | 'document';
  due_at: string | null;
  evaluation_type: 'marks' | 'stars';
  max_marks: number | null;
  instructions: string | null;
}

export interface AnnounceAssignmentInput {
  assignment: AnnounceableAssignment;
  /**
   * 'published' is the first announcement. 'linked' is the follow-up for an
   * assignment that was already announced and has now been attached to a class.
   */
  kind: 'published' | 'linked';
  /** The teacher's delegated Graph bearer, or null when there isn't a real one. */
  token: string | null;
  /** Base origin for the student deep link, from shareBaseUrl(). */
  shareBase: string;
  supabase: AdminClient;
}

/**
 * Announce an assignment everywhere it should be announced, and record that it
 * was. The one chokepoint for "tell the students about this assignment".
 *
 * Order matters. The bells are written LAST and unconditionally, because they
 * are the durable record: a Graph failure, an unlinked classroom, or a parent
 * token must never cost a student the in-app notification. That is the same
 * reasoning notify-students.ts applies to the Teams activity ping.
 *
 * Never throws. Callers fire it without awaiting, so a rejection here would be
 * an unhandled rejection rather than a failed publish.
 */
export async function announceAssignment(input: AnnounceAssignmentInput): Promise<void> {
  const { assignment: a, kind, token, shareBase, supabase } = input;
  const db = supabase as any;

  // The class this assignment belongs to, when it has one. Its name is what
  // makes a timetable-created assignment read as one message instead of two.
  let className: string | null = null;
  let classDate: string | null = null;
  if (a.scheduled_class_id) {
    const { data: cls } = await db
      .from('nexus_scheduled_classes')
      .select('title, scheduled_date')
      .eq('id', a.scheduled_class_id)
      .maybeSingle();
    if (cls) {
      className = cls.title || null;
      classDate = cls.scheduled_date || null;
    }
  }

  const card: AssignmentCard = {
    title: a.title,
    assignmentType: a.assignment_type === 'drawing' ? 'drawing' : 'document',
    dueAt: a.due_at,
    evaluationType: a.evaluation_type === 'stars' ? 'stars' : 'marks',
    maxMarks: a.max_marks,
    instructions: a.instructions,
    className,
    classDate,
    assignmentUrl: classShareLinks(shareBase).assignment(a.id),
  };

  const html =
    kind === 'linked' ? buildAssignmentLinkedHtml(card) : buildAssignmentPublishedHtml(card);

  // 1. Teams channel + group chat. Needs a real delegated token.
  if (canPostToGraph(token)) {
    try {
      const posted = await announceAssignmentToTeams(token, supabase, a.classroom_id, html);
      if (posted) {
        await db
          .from('nexus_class_assignments')
          .update({
            teams_channel_id: posted.channelId,
            teams_channel_message_id: posted.channelMessageId,
            teams_group_chat_message_id: posted.chatMessageId,
          })
          .eq('id', a.id);
      }
    } catch (err) {
      console.error('[assignment announce] Teams post failed (non-blocking):', err);
    }
  }

  // 2. Stamp the announce-once markers whether or not Teams worked. They record
  //    "this assignment has been announced", not "Teams accepted the card": a
  //    Graph outage must not leave the row eligible to re-announce on the next
  //    unrelated save.
  try {
    const stamp: Record<string, unknown> =
      kind === 'linked'
        ? { teams_announced_class_id: a.scheduled_class_id }
        : { teams_announced_at: new Date().toISOString(), teams_announced_class_id: a.scheduled_class_id };
    await db.from('nexus_class_assignments').update(stamp).eq('id', a.id);
  } catch (err) {
    console.error('[assignment announce] Could not stamp announce marker:', err);
  }

  // 3. The bells + the Teams activity ping. Always.
  try {
    const dueLine = a.due_at
      ? ` Due ${new Date(a.due_at).toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: 'numeric',
          month: 'short',
        })}.`
      : '';
    await notifyStudents({
      classroomId: a.classroom_id,
      eventType: kind === 'linked' ? 'assignment_linked' : 'assignment_published',
      title: kind === 'linked' ? 'Assignment added to your class' : 'New assignment',
      message:
        kind === 'linked'
          ? `"${a.title}" is now part of ${className || 'your class'}.${dueLine} Please complete it.`
          : `"${a.title}" has been assigned.${dueLine} Please complete it.`,
      teamsText: kind === 'linked' ? `Assignment added: ${a.title}` : `New assignment: ${a.title}`,
      metadata: { assignment_id: a.id, scheduled_class_id: a.scheduled_class_id },
      topBar: true,
    });
  } catch (err) {
    console.error('[assignment announce] Student notify failed (non-blocking):', err);
  }
}
