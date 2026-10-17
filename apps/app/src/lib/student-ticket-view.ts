/**
 * The shape of a support ticket the Tools App sends to its owner.
 *
 * getSupportTicketDetail(..., { forStudent: true }) already drops the
 * staff-only columns (console logs, device info, reopen snapshots), internal
 * notes and hidden activity. This file goes one step further and keeps only
 * what the student screens use: no staff user ids, no staff surnames, no
 * activity metadata. Staff appear as "Priya from Neram".
 *
 * Pure, no server imports, so the screens can import the types.
 */

import type {
  SupportTicket,
  SupportTicketStatus,
  SupportTicketStudentView,
} from '@neram/database';
import { canStudentReopenTicket } from '@neram/database/support-ticket-status';

export interface StudentTicketListRow {
  id: string;
  ticket_number: string;
  category: SupportTicket['category'];
  subject: string;
  status: SupportTicketStatus;
  resolution_code: SupportTicket['resolution_code'];
  auto_close_at: string | null;
  closed_at: string | null;
  last_reply_at: string | null;
  last_reply_by: SupportTicket['last_reply_by'];
  created_at: string;
  updated_at: string;
  /** Staff replied after the student last opened it. */
  has_unread: boolean;
}

export function toStudentListRow(t: SupportTicket): StudentTicketListRow {
  const lastReply = t.last_reply_at ? new Date(t.last_reply_at).getTime() : 0;
  const seen = t.student_seen_at ? new Date(t.student_seen_at).getTime() : 0;
  return {
    id: t.id,
    ticket_number: t.ticket_number,
    category: t.category,
    subject: t.subject,
    status: t.status,
    resolution_code: t.resolution_code ?? null,
    auto_close_at: t.auto_close_at ?? null,
    closed_at: t.closed_at ?? null,
    last_reply_at: t.last_reply_at ?? null,
    last_reply_by: t.last_reply_by ?? null,
    created_at: t.created_at,
    updated_at: t.updated_at,
    has_unread: t.last_reply_by === 'staff' && lastReply > seen,
  };
}

/** "Priya Raman" → "Priya from Neram". No name → "Neram Support". */
export function staffLabel(name: string | null | undefined): string {
  const first = (name || '').trim().split(/\s+/)[0];
  if (!first || /^neram$/i.test(first)) return 'Neram Support';
  return `${first} from Neram`;
}

export interface StudentTicketMessage {
  id: string;
  side: 'staff' | 'student';
  author_label: string;
  content: string;
  created_at: string;
}

export interface StudentTicketEvent {
  id: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  /** The resolve or close note, or the student's own "still happening" reason. */
  reason: string | null;
  actor_label: string;
  created_at: string;
}

export interface StudentTicketDetail {
  id: string;
  ticket_number: string;
  category: SupportTicket['category'];
  subject: string;
  description: string;
  page_url: string | null;
  screenshot_urls: string[];
  status: SupportTicketStatus;
  resolution_code: SupportTicket['resolution_code'];
  resolution_notes: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  auto_close_at: string | null;
  duplicate_of_number: string | null;
  reopen_count: number;
  last_reply_by: SupportTicket['last_reply_by'];
  created_at: string;
  updated_at: string;
  /** Who is on it, as "Priya from Neram", or null while nobody is. */
  handler_label: string | null;
  /** May say "still happening" now (awaiting confirmation, or closed within 7 days). */
  can_reopen: boolean;
}

export interface StudentTicketPayload {
  ticket: StudentTicketDetail;
  comments: StudentTicketMessage[];
  activity: StudentTicketEvent[];
}

const STUDENT_ACTIVITY = new Set([
  'created',
  'started',
  'info_requested',
  'student_replied',
  'resumed',
  'resolved',
  'confirmed',
  'reopened',
  'closed',
  'auto_closed',
]);

export function toStudentTicketPayload(view: SupportTicketStudentView, now: number = Date.now()): StudentTicketPayload {
  const ownerId = view.user_id;
  const ticket: StudentTicketDetail = {
    id: view.id,
    ticket_number: view.ticket_number,
    category: view.category,
    subject: view.subject,
    description: view.description,
    page_url: view.page_url ?? null,
    screenshot_urls: view.screenshot_urls || [],
    status: view.status,
    resolution_code: view.resolution_code ?? null,
    resolution_notes: view.resolution_notes ?? null,
    resolved_at: view.resolved_at ?? null,
    closed_at: view.closed_at ?? null,
    auto_close_at: view.auto_close_at ?? null,
    duplicate_of_number: view.duplicate_of_number ?? null,
    reopen_count: view.reopen_count ?? 0,
    last_reply_by: view.last_reply_by ?? null,
    created_at: view.created_at,
    updated_at: view.updated_at,
    handler_label: view.assignee_name ? staffLabel(view.assignee_name) : null,
    can_reopen: canStudentReopenTicket({ status: view.status, closed_at: view.closed_at ?? null }, now),
  };

  const comments: StudentTicketMessage[] = (view.comments || [])
    // Belt and braces: the query already leaves internal notes out.
    .filter((c) => !c.is_internal)
    .map((c) => ({
      id: c.id,
      side: c.is_admin ? 'staff' : 'student',
      author_label: c.is_admin ? staffLabel(c.user_name) : 'You',
      content: c.content,
      created_at: c.created_at,
    }));

  const activity: StudentTicketEvent[] = (view.activity || [])
    .filter((a) => a.visible_to_student !== false && STUDENT_ACTIVITY.has(a.action))
    .map((a) => ({
      id: a.id,
      action: a.action,
      old_status: a.old_status,
      new_status: a.new_status,
      reason: a.action === 'resolved' || a.action === 'closed' || a.action === 'reopened' ? a.reason : null,
      actor_label:
        a.actor_id && ownerId && a.actor_id === ownerId
          ? 'You'
          : a.actor_id
            ? staffLabel(a.actor_name)
            : 'Neram Support',
      created_at: a.created_at,
    }));

  return { ticket, comments, activity };
}

/** One short line per step the student can see, for the conversation. Null leaves a step out. */
export function eventLine(e: Pick<StudentTicketEvent, 'action' | 'actor_label' | 'old_status'>): string | null {
  const who = e.actor_label;
  switch (e.action) {
    case 'created':
      return 'You sent this request';
    case 'started':
      return `${who} started working on it`;
    case 'info_requested':
      return `${who} asked you for more details`;
    case 'student_replied':
    case 'resumed':
      return 'Back with the team';
    case 'resolved':
      return `${who} marked it fixed`;
    case 'confirmed':
      return who === 'You' ? 'You confirmed it is fixed' : 'Confirmed as fixed';
    case 'reopened':
      return who === 'You' ? 'You said it is still happening' : `${who} reopened it`;
    case 'closed':
      return 'Closed';
    case 'auto_closed':
      return e.old_status === 'waiting_on_student'
        ? 'Closed, as we did not hear back'
        : 'Closed automatically after the fix';
    default:
      return null;
  }
}
