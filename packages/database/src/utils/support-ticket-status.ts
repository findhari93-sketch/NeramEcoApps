/**
 * The support ticket lifecycle (Admin inbox, Tools App /support), in one place.
 *
 * The Admin inbox, the Tools App ticket page and both PATCH routes read this
 * file, so the button a screen offers and the move the server accepts cannot
 * drift apart. Routes enforce `canMove`; screens render `actionsFor`.
 *
 *   open ──start──▶ in_progress ──request_info──▶ waiting_on_student
 *     │                 │  ▲                          │
 *     │                 │  └──── requester replies ───┘
 *     │                 ▼
 *     └────resolve──▶ awaiting_confirmation ──confirm / 3 days──▶ closed
 *                        │                                          │
 *                        └──── still happening (reopen) ◀───────────┘
 *
 * "close" (staff, with an outcome) ends any active ticket without asking the
 * requester to confirm. waiting_on_student closes on its own after 7 days.
 *
 * Mirrors apps/nexus/src/lib/issue-status.ts (Nexus tickets live in a separate
 * table) minus delegate, return and recheck, which Admin has no use for.
 *
 * Pure: no client imports, so pages may import it.
 */

import type { SupportTicketResolutionCode, SupportTicketStatus } from '../types';

export type TicketRole = 'staff' | 'student';

/** Whose move it is. Drives the queue a ticket sits in and the badge it lights. */
export type TicketTurn = 'staff' | 'student' | 'none';

export type TicketMove =
  | 'start'
  | 'assign'
  | 'request_info'
  | 'resume'
  | 'resolve'
  | 'close'
  | 'confirm'
  | 'reopen';

export type TicketChipColor = 'default' | 'warning' | 'info' | 'success' | 'secondary';

export interface TicketStatusMeta {
  staffLabel: string;
  studentLabel: string;
  color: TicketChipColor;
  /** Position on the four-step tracker: 0 New, 1 In progress, 2 Resolved, 3 Closed. */
  step: 0 | 1 | 2 | 3;
  turn: TicketTurn;
}

export const TICKET_STATUS_META: Record<SupportTicketStatus, TicketStatusMeta> = {
  open: { staffLabel: 'New', studentLabel: 'Received', color: 'warning', step: 0, turn: 'staff' },
  in_progress: { staffLabel: 'In progress', studentLabel: 'Being worked on', color: 'info', step: 1, turn: 'staff' },
  waiting_on_student: { staffLabel: 'Waiting on requester', studentLabel: 'Needs your reply', color: 'warning', step: 1, turn: 'student' },
  awaiting_confirmation: { staffLabel: 'Awaiting confirmation', studentLabel: 'Fixed? Please confirm', color: 'success', step: 2, turn: 'student' },
  // Legacy: 20261206090100 moved these rows to closed. Kept so an old value still renders.
  resolved: { staffLabel: 'Resolved', studentLabel: 'Resolved', color: 'success', step: 3, turn: 'none' },
  closed: { staffLabel: 'Closed', studentLabel: 'Closed', color: 'default', step: 3, turn: 'none' },
};

export function ticketStatusMeta(status: string): TicketStatusMeta {
  return TICKET_STATUS_META[status as SupportTicketStatus] ?? TICKET_STATUS_META.open;
}

export const TICKET_TRACKER_STEPS = {
  staff: ['New', 'In progress', 'Resolved', 'Closed'],
  student: ['Received', 'Being worked on', 'Fixed', 'Closed'],
} as const;

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

export interface TicketOutcomeDef {
  code: SupportTicketResolutionCode;
  label: string;
  /** What the note box suggests when this outcome is picked. */
  hint: string;
}

/** The outcomes staff choose from. no_response is written by the cron only. */
export const TICKET_STAFF_OUTCOMES: TicketOutcomeDef[] = [
  { code: 'fixed', label: 'Fixed', hint: 'What was wrong and what changed.' },
  { code: 'answered', label: 'Answered', hint: 'The answer to their question.' },
  { code: 'not_a_bug', label: 'Working as intended', hint: 'Why it works this way, and what to do instead.' },
  { code: 'duplicate', label: 'Duplicate', hint: 'Which ticket already covers this.' },
  { code: 'wont_fix', label: "Won't fix", hint: 'Why this will not change.' },
];

export const TICKET_OUTCOME_LABEL: Record<SupportTicketResolutionCode, string> = {
  fixed: 'Fixed',
  answered: 'Answered',
  not_a_bug: 'Working as intended',
  duplicate: 'Duplicate',
  wont_fix: "Won't fix",
  no_response: 'No reply',
};

const STAFF_OUTCOME_CODES = new Set<string>(TICKET_STAFF_OUTCOMES.map((o) => o.code));

/** A code staff may send. no_response is refused: only the cron writes it. */
export function isTicketStaffOutcome(value: unknown): value is SupportTicketResolutionCode {
  return typeof value === 'string' && STAFF_OUTCOME_CODES.has(value);
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export const TICKET_ACTIVE_STATUSES: SupportTicketStatus[] = ['open', 'in_progress', 'waiting_on_student'];
const DONE: SupportTicketStatus[] = ['awaiting_confirmation', 'resolved', 'closed'];

const STAFF_MOVES: Record<TicketMove, SupportTicketStatus[]> = {
  start: ['open'],
  assign: TICKET_ACTIVE_STATUSES,
  request_info: ['open', 'in_progress'],
  resume: ['waiting_on_student'],
  resolve: TICKET_ACTIVE_STATUSES,
  close: [...TICKET_ACTIVE_STATUSES, 'awaiting_confirmation', 'resolved'],
  // Staff may confirm on the requester's behalf, e.g. after a phone call.
  confirm: ['awaiting_confirmation'],
  reopen: DONE,
};

const STUDENT_MOVES: Partial<Record<TicketMove, SupportTicketStatus[]>> = {
  confirm: ['awaiting_confirmation'],
  // closed and resolved are further limited by canStudentReopenTicket's window.
  reopen: DONE,
};

/** May this role make this move from this status? The routes' guard. */
export function canTicketMove(status: string, move: TicketMove, role: TicketRole): boolean {
  const table = role === 'staff' ? STAFF_MOVES : STUDENT_MOVES;
  return (table[move] ?? []).includes(status as SupportTicketStatus);
}

/** How long after closing a requester may still reopen instead of reporting again. */
export const TICKET_STUDENT_REOPEN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A requester may say "still happening" while a ticket waits for their
 * confirmation, and for TICKET_STUDENT_REOPEN_DAYS after it closed. Past that
 * the screen offers "Report it again", which starts a fresh ticket naming this
 * one, rather than resurrecting a thread nobody remembers.
 *
 * Reads closed_at, not updated_at: any edit moves updated_at.
 */
export function canStudentReopenTicket(
  ticket: { status: string; closed_at: string | null },
  now: number = Date.now()
): boolean {
  if (ticket.status === 'awaiting_confirmation') return true;
  if (ticket.status !== 'closed' && ticket.status !== 'resolved') return false;
  if (!ticket.closed_at) return false;
  const closedAt = new Date(ticket.closed_at).getTime();
  if (Number.isNaN(closedAt)) return false;
  return now - closedAt <= TICKET_STUDENT_REOPEN_DAYS * DAY_MS;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export interface TicketAction {
  move: TicketMove;
  label: string;
  /** One per status: the filled button. */
  primary: boolean;
}

const STAFF_ACTIONS: Record<SupportTicketStatus, TicketAction[]> = {
  open: [
    { move: 'start', label: 'Start', primary: true },
    { move: 'request_info', label: 'Ask requester', primary: false },
    { move: 'resolve', label: 'Resolve', primary: false },
    { move: 'close', label: 'Close', primary: false },
  ],
  in_progress: [
    { move: 'resolve', label: 'Resolve', primary: true },
    { move: 'request_info', label: 'Ask requester', primary: false },
    { move: 'close', label: 'Close', primary: false },
  ],
  waiting_on_student: [
    { move: 'resume', label: 'Resume', primary: true },
    { move: 'resolve', label: 'Resolve', primary: false },
    { move: 'close', label: 'Close', primary: false },
  ],
  awaiting_confirmation: [
    { move: 'confirm', label: 'Mark confirmed', primary: true },
    { move: 'reopen', label: 'Reopen', primary: false },
    { move: 'close', label: 'Close', primary: false },
  ],
  resolved: [
    { move: 'reopen', label: 'Reopen', primary: true },
    { move: 'close', label: 'Close', primary: false },
  ],
  closed: [{ move: 'reopen', label: 'Reopen', primary: true }],
};

/**
 * The buttons a staff screen shows for a status, in order, primary first.
 * Every entry is a move canTicketMove allows; the test holds that.
 */
export function ticketActionsFor(status: string): TicketAction[] {
  return STAFF_ACTIONS[status as SupportTicketStatus] ?? [];
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

export type TicketStaffQueue = 'new' | 'in_progress' | 'waiting' | 'to_confirm' | 'closed';
export type TicketStudentQueue = 'needs_you' | 'active' | 'closed';

/** The statuses each Admin inbox tab lists. */
export const TICKET_QUEUE_STATUSES: Record<TicketStaffQueue, SupportTicketStatus[]> = {
  new: ['open'],
  in_progress: ['in_progress'],
  waiting: ['waiting_on_student'],
  to_confirm: ['awaiting_confirmation'],
  closed: ['closed', 'resolved'],
};

export function ticketStaffQueueOf(status: string): TicketStaffQueue {
  switch (status) {
    case 'open':
      return 'new';
    case 'in_progress':
      return 'in_progress';
    case 'waiting_on_student':
      return 'waiting';
    case 'awaiting_confirmation':
      return 'to_confirm';
    default:
      return 'closed';
  }
}

export function ticketStudentQueueOf(status: string): TicketStudentQueue {
  const turn = ticketStatusMeta(status).turn;
  if (turn === 'student') return 'needs_you';
  if (turn === 'staff') return 'active';
  return 'closed';
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Days after resolving before an unconfirmed ticket closes on its own. */
export const TICKET_CONFIRM_DAYS = 3;
/** Days after asking the requester before a silent ticket closes as no_response. */
export const TICKET_WAITING_DAYS = 7;
/** A new ticket nobody has picked up for this long gets a warning on the list. */
export const TICKET_STALE_NEW_DAYS = 2;

/** ISO time `days` from `now`. */
export function ticketDaysFromNow(days: number, now: number = Date.now()): string {
  return new Date(now + days * DAY_MS).toISOString();
}

/**
 * The server sets auto_close_at to exactly N days from its clock. Rounding up
 * against a viewer's clock that runs a moment behind turned 3 into 4 (seen on
 * staging, NERAM-TKT-00006), so an hour of drift is forgiven.
 */
const CLOCK_TOLERANCE_MS = 60 * 60 * 1000;

/** Whole days until an ISO time, never negative. Null when there is no time. */
export function ticketDaysUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - now - CLOCK_TOLERANCE_MS) / DAY_MS));
}

/** Whole days since an ISO time, never negative. */
export function ticketDaysSince(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** "closes today", "closes in 1 day", "closes in 5 days". */
export function ticketClosesInText(iso: string | null | undefined, now: number = Date.now()): string | null {
  const d = ticketDaysUntil(iso, now);
  if (d === null) return null;
  if (d === 0) return 'closes today';
  return `closes in ${d} day${d === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const TICKET_CATEGORY_LABEL: Record<string, string> = {
  enrollment_issue: 'Enrollment',
  payment_issue: 'Payment',
  technical_issue: 'Technical',
  account_issue: 'Account',
  course_question: 'Course question',
  other: 'Other',
};

export const TICKET_SOURCE_LABEL: Record<string, string> = {
  app: 'Tools App',
  nexus: 'Nexus',
  marketing: 'Website',
};
