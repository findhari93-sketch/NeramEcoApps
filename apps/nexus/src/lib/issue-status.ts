/**
 * The support ticket lifecycle, in one place.
 *
 * Both issues pages and the PATCH route read this file, so the button a screen
 * offers and the move the server accepts cannot drift apart. The route enforces
 * `canMove`; the screens only show what `canMove` allows.
 *
 *   open ──start──▶ in_progress ──request_info──▶ waiting_on_student
 *     │                 │  ▲                          │
 *     │                 │  └──── student replies ─────┘
 *     │                 ▼
 *     └────resolve──▶ awaiting_confirmation ──confirm / 3 days──▶ closed
 *                        │                                          │
 *                        └──── still happening (reopen) ◀───────────┘
 *
 * "close" (staff, with an outcome) ends any active ticket without asking the
 * student to confirm. waiting_on_student closes on its own after 7 days.
 */

import type {
  FoundationIssueResolutionCode,
  FoundationIssueStatus,
} from '@neram/database/types';

export type IssueRole = 'staff' | 'student';

/** Whose move it is. Drives the queue a ticket sits in and the badge it lights. */
export type IssueTurn = 'staff' | 'student' | 'none';

export type IssueMove =
  | 'start'
  | 'assign'
  | 'request_info'
  | 'resume'
  | 'resolve'
  | 'close'
  | 'recheck'
  | 'confirm'
  | 'reopen'
  | 'delegate'
  | 'return';

export type ChipColor = 'default' | 'warning' | 'info' | 'success' | 'secondary';

export interface IssueStatusMeta {
  staffLabel: string;
  studentLabel: string;
  color: ChipColor;
  /** Position on the four-step tracker: 0 New, 1 In progress, 2 Resolved, 3 Closed. */
  step: 0 | 1 | 2 | 3;
  turn: IssueTurn;
}

export const STATUS_META: Record<FoundationIssueStatus, IssueStatusMeta> = {
  open: { staffLabel: 'New', studentLabel: 'Received', color: 'warning', step: 0, turn: 'staff' },
  in_progress: { staffLabel: 'In progress', studentLabel: 'Being worked on', color: 'info', step: 1, turn: 'staff' },
  waiting_on_student: { staffLabel: 'Waiting on student', studentLabel: 'Needs your reply', color: 'warning', step: 1, turn: 'student' },
  awaiting_confirmation: { staffLabel: 'Awaiting confirmation', studentLabel: 'Fixed? Please confirm', color: 'success', step: 2, turn: 'student' },
  // Legacy: nothing has written 'resolved' since 2026-03, one old row survives.
  resolved: { staffLabel: 'Resolved', studentLabel: 'Resolved', color: 'success', step: 2, turn: 'none' },
  closed: { staffLabel: 'Closed', studentLabel: 'Closed', color: 'default', step: 3, turn: 'none' },
};

export function statusMeta(status: string): IssueStatusMeta {
  return STATUS_META[status as FoundationIssueStatus] ?? STATUS_META.open;
}

export const TRACKER_STEPS = {
  staff: ['New', 'In progress', 'Resolved', 'Closed'],
  student: ['Received', 'Being worked on', 'Fixed', 'Closed'],
} as const;

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

export interface OutcomeDef {
  code: FoundationIssueResolutionCode;
  label: string;
  /** What the note box suggests when this outcome is picked. */
  hint: string;
}

/** The outcomes staff choose from. no_response is written by the cron only. */
export const STAFF_OUTCOMES: OutcomeDef[] = [
  { code: 'fixed', label: 'Fixed', hint: 'What was wrong and what changed.' },
  { code: 'answered', label: 'Answered', hint: 'The answer to their question.' },
  { code: 'not_a_bug', label: 'Working as intended', hint: 'Why it works this way, and what to do instead.' },
  { code: 'duplicate', label: 'Duplicate', hint: 'Which ticket already covers this.' },
  { code: 'wont_fix', label: "Won't fix", hint: 'Why this will not change.' },
];

export const OUTCOME_LABEL: Record<FoundationIssueResolutionCode, string> = {
  fixed: 'Fixed',
  answered: 'Answered',
  not_a_bug: 'Working as intended',
  duplicate: 'Duplicate',
  wont_fix: "Won't fix",
  no_response: 'No reply',
};

const STAFF_OUTCOME_CODES = new Set<string>(STAFF_OUTCOMES.map((o) => o.code));

/** A code staff may send. no_response is refused: only the cron writes it. */
export function isStaffOutcome(value: unknown): value is FoundationIssueResolutionCode {
  return typeof value === 'string' && STAFF_OUTCOME_CODES.has(value);
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

const ACTIVE: FoundationIssueStatus[] = ['open', 'in_progress', 'waiting_on_student'];
const DONE: FoundationIssueStatus[] = ['awaiting_confirmation', 'resolved', 'closed'];

const STAFF_MOVES: Record<IssueMove, FoundationIssueStatus[]> = {
  start: ['open'],
  assign: ACTIVE,
  request_info: ['open', 'in_progress'],
  resume: ['waiting_on_student'],
  resolve: ACTIVE,
  close: [...ACTIVE, 'awaiting_confirmation', 'resolved'],
  recheck: ['awaiting_confirmation', 'resolved'],
  // Staff may confirm on the student's behalf, e.g. after a phone call. It was
  // allowed before this file existed and nothing depends on taking it away.
  confirm: ['awaiting_confirmation'],
  reopen: DONE,
  delegate: ['in_progress', 'waiting_on_student'],
  return: ['in_progress', 'waiting_on_student'],
};

const STUDENT_MOVES: Partial<Record<IssueMove, FoundationIssueStatus[]>> = {
  confirm: ['awaiting_confirmation'],
  // closed and resolved are further limited by canStudentReopen's window.
  reopen: DONE,
};

/** May this role make this move from this status? The route's guard. */
export function canMove(status: string, move: IssueMove, role: IssueRole): boolean {
  const table = role === 'staff' ? STAFF_MOVES : STUDENT_MOVES;
  return (table[move] ?? []).includes(status as FoundationIssueStatus);
}

/** How long after closing a student may still reopen instead of reporting again. */
export const STUDENT_REOPEN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A student may say "still happening" while a ticket waits for their
 * confirmation, and for STUDENT_REOPEN_DAYS after it closed. Past that the
 * screen offers "Report it again", which starts a fresh ticket that names this
 * one, rather than resurrecting a month-old thread nobody remembers.
 */
export function canStudentReopen(
  issue: { status: string; updated_at: string },
  now: number = Date.now()
): boolean {
  if (issue.status === 'awaiting_confirmation') return true;
  if (issue.status !== 'closed' && issue.status !== 'resolved') return false;
  const closedAt = new Date(issue.updated_at).getTime();
  if (Number.isNaN(closedAt)) return false;
  return now - closedAt <= STUDENT_REOPEN_DAYS * DAY_MS;
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

export type StaffQueue = 'new' | 'in_progress' | 'waiting' | 'to_confirm' | 'closed';
export type StudentQueue = 'needs_you' | 'active' | 'closed';

export function staffQueueOf(status: string): StaffQueue {
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

export function studentQueueOf(status: string): StudentQueue {
  const turn = statusMeta(status).turn;
  if (turn === 'student') return 'needs_you';
  if (turn === 'staff') return 'active';
  return 'closed';
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Whole days until an ISO time, never negative. Null when there is no time. */
export function daysUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - now) / DAY_MS));
}

/** Whole days since an ISO time, never negative. */
export function daysSince(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** "closes today", "closes in 1 day", "closes in 5 days". */
export function closesInText(iso: string | null | undefined, now: number = Date.now()): string | null {
  const d = daysUntil(iso, now);
  if (d === null) return null;
  if (d === 0) return 'closes today';
  return `closes in ${d} day${d === 1 ? '' : 's'}`;
}

/** A new ticket nobody has picked up for this long gets a warning on the list. */
export const STALE_NEW_DAYS = 2;

/**
 * The auto-close clocks, for copy on screen. They mirror CONFIRM_AUTO_CLOSE_DAYS
 * and WAITING_AUTO_CLOSE_DAYS in @neram/database, which set the real
 * auto_close_at; that module pulls in the admin client, so a page cannot import
 * it. issue-status.test.ts fails if the two ever disagree.
 */
export const CONFIRM_DAYS = 3;
export const WAITING_DAYS = 7;
