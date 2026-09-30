import { describe, expect, it } from 'vitest';
import {
  CONFIRM_AUTO_CLOSE_DAYS,
  WAITING_AUTO_CLOSE_DAYS,
} from '@neram/database/queries/nexus';
import {
  canMove,
  canStudentReopen,
  closesInText,
  CONFIRM_DAYS,
  daysUntil,
  isStaffOutcome,
  STAFF_OUTCOMES,
  staffQueueOf,
  statusMeta,
  STUDENT_REOPEN_DAYS,
  studentQueueOf,
  WAITING_DAYS,
  type IssueMove,
} from './issue-status';

/**
 * The ticket lifecycle both screens and the PATCH route read. What this guards:
 *  - the server refuses every move the lifecycle does not allow, so a stale tab
 *    cannot "Start working" on a ticket someone just closed;
 *  - a student can only confirm or reopen, and reopen only inside the window;
 *  - the copy on screen quotes the same auto-close clocks the database sets.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-01T10:00:00Z');

describe('canMove, staff', () => {
  const allowed: Record<IssueMove, string[]> = {
    start: ['open'],
    assign: ['open', 'in_progress', 'waiting_on_student'],
    request_info: ['open', 'in_progress'],
    resume: ['waiting_on_student'],
    resolve: ['open', 'in_progress', 'waiting_on_student'],
    close: ['open', 'in_progress', 'waiting_on_student', 'awaiting_confirmation', 'resolved'],
    recheck: ['awaiting_confirmation', 'resolved'],
    confirm: ['awaiting_confirmation'],
    reopen: ['awaiting_confirmation', 'resolved', 'closed'],
    delegate: ['in_progress', 'waiting_on_student'],
    return: ['in_progress', 'waiting_on_student'],
  };
  const statuses = ['open', 'in_progress', 'waiting_on_student', 'awaiting_confirmation', 'resolved', 'closed'];

  for (const [move, ok] of Object.entries(allowed) as [IssueMove, string[]][]) {
    for (const status of statuses) {
      const expected = ok.includes(status);
      it(`${move} from ${status} is ${expected ? 'allowed' : 'refused'}`, () => {
        expect(canMove(status, move, 'staff')).toBe(expected);
      });
    }
  }

  it('refuses a status it has never heard of', () => {
    expect(canMove('archived', 'start', 'staff')).toBe(false);
  });
});

describe('canMove, student', () => {
  it('may confirm only while asked to', () => {
    expect(canMove('awaiting_confirmation', 'confirm', 'student')).toBe(true);
    expect(canMove('in_progress', 'confirm', 'student')).toBe(false);
  });

  it('may reopen a finished ticket', () => {
    expect(canMove('awaiting_confirmation', 'reopen', 'student')).toBe(true);
    expect(canMove('closed', 'reopen', 'student')).toBe(true);
    expect(canMove('open', 'reopen', 'student')).toBe(false);
  });

  it('can never make a staff move', () => {
    for (const move of ['start', 'assign', 'request_info', 'resume', 'resolve', 'close', 'recheck', 'delegate', 'return'] as IssueMove[]) {
      for (const status of ['open', 'in_progress', 'waiting_on_student', 'awaiting_confirmation', 'closed']) {
        expect(canMove(status, move, 'student')).toBe(false);
      }
    }
  });
});

describe('canStudentReopen', () => {
  it('always while the ticket waits for their confirmation', () => {
    expect(canStudentReopen({ status: 'awaiting_confirmation', updated_at: '2020-01-01T00:00:00Z' }, NOW)).toBe(true);
  });

  it(`for ${STUDENT_REOPEN_DAYS} days after it closed`, () => {
    const justInside = new Date(NOW - (STUDENT_REOPEN_DAYS * DAY - 60_000)).toISOString();
    const justOutside = new Date(NOW - (STUDENT_REOPEN_DAYS * DAY + 60_000)).toISOString();
    expect(canStudentReopen({ status: 'closed', updated_at: justInside }, NOW)).toBe(true);
    expect(canStudentReopen({ status: 'closed', updated_at: justOutside }, NOW)).toBe(false);
  });

  it('never for a ticket still in play, or with an unreadable date', () => {
    expect(canStudentReopen({ status: 'in_progress', updated_at: new Date(NOW).toISOString() }, NOW)).toBe(false);
    expect(canStudentReopen({ status: 'closed', updated_at: 'not a date' }, NOW)).toBe(false);
  });
});

describe('queues', () => {
  it('puts every status in exactly one staff queue', () => {
    expect(staffQueueOf('open')).toBe('new');
    expect(staffQueueOf('in_progress')).toBe('in_progress');
    expect(staffQueueOf('waiting_on_student')).toBe('waiting');
    expect(staffQueueOf('awaiting_confirmation')).toBe('to_confirm');
    expect(staffQueueOf('resolved')).toBe('closed');
    expect(staffQueueOf('closed')).toBe('closed');
  });

  it('puts the two student-turn statuses under Needs you', () => {
    expect(studentQueueOf('waiting_on_student')).toBe('needs_you');
    expect(studentQueueOf('awaiting_confirmation')).toBe('needs_you');
    expect(studentQueueOf('open')).toBe('active');
    expect(studentQueueOf('in_progress')).toBe('active');
    expect(studentQueueOf('closed')).toBe('closed');
  });

  it('labels waiting in words for both sides', () => {
    expect(statusMeta('waiting_on_student').staffLabel).toBe('Waiting on student');
    expect(statusMeta('waiting_on_student').studentLabel).toBe('Needs your reply');
    expect(statusMeta('waiting_on_student').step).toBe(1);
  });
});

describe('outcomes', () => {
  it('lets staff pick every listed outcome', () => {
    for (const o of STAFF_OUTCOMES) expect(isStaffOutcome(o.code)).toBe(true);
  });

  it('refuses no_response, which only the auto-close cron writes', () => {
    expect(isStaffOutcome('no_response')).toBe(false);
    expect(isStaffOutcome('fixed; drop table')).toBe(false);
    expect(isStaffOutcome(undefined)).toBe(false);
  });
});

describe('auto-close clocks', () => {
  it('quotes the same days the database sets', () => {
    expect(CONFIRM_DAYS).toBe(CONFIRM_AUTO_CLOSE_DAYS);
    expect(WAITING_DAYS).toBe(WAITING_AUTO_CLOSE_DAYS);
  });

  it('counts whole days, never negative', () => {
    expect(daysUntil(new Date(NOW + 2.2 * DAY).toISOString(), NOW)).toBe(3);
    expect(daysUntil(new Date(NOW - DAY).toISOString(), NOW)).toBe(0);
    expect(daysUntil(null, NOW)).toBeNull();
  });

  it('reads as a sentence', () => {
    expect(closesInText(new Date(NOW + 1000).toISOString(), NOW)).toBe('closes in 1 day');
    expect(closesInText(new Date(NOW - 1000).toISOString(), NOW)).toBe('closes today');
    expect(closesInText(new Date(NOW + 5 * DAY).toISOString(), NOW)).toBe('closes in 5 days');
  });
});
