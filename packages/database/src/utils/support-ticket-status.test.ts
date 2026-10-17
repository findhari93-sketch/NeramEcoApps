import { describe, it, expect } from 'vitest';
import {
  TICKET_STATUS_META,
  TICKET_STAFF_OUTCOMES,
  TICKET_QUEUE_STATUSES,
  TICKET_CONFIRM_DAYS,
  TICKET_WAITING_DAYS,
  canTicketMove,
  canStudentReopenTicket,
  isTicketStaffOutcome,
  ticketActionsFor,
  ticketStaffQueueOf,
  ticketStudentQueueOf,
  ticketClosesInText,
  ticketDaysUntil,
  ticketDaysFromNow,
  type TicketMove,
} from './support-ticket-status';
import type { SupportTicketStatus } from '../types';

const STATUSES = Object.keys(TICKET_STATUS_META) as SupportTicketStatus[];
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-17T06:00:00Z');

describe('canTicketMove: staff', () => {
  const table: Record<TicketMove, SupportTicketStatus[]> = {
    start: ['open'],
    assign: ['open', 'in_progress', 'waiting_on_student'],
    request_info: ['open', 'in_progress'],
    resume: ['waiting_on_student'],
    resolve: ['open', 'in_progress', 'waiting_on_student'],
    close: ['open', 'in_progress', 'waiting_on_student', 'awaiting_confirmation', 'resolved'],
    confirm: ['awaiting_confirmation'],
    reopen: ['awaiting_confirmation', 'resolved', 'closed'],
  };

  for (const [move, allowed] of Object.entries(table) as [TicketMove, SupportTicketStatus[]][]) {
    for (const status of STATUSES) {
      const expected = allowed.includes(status);
      it(`${move} from ${status} is ${expected ? 'allowed' : 'refused'}`, () => {
        expect(canTicketMove(status, move, 'staff')).toBe(expected);
      });
    }
  }

  it('cannot close a ticket that is already closed', () => {
    expect(canTicketMove('closed', 'close', 'staff')).toBe(false);
  });
});

describe('canTicketMove: student', () => {
  it('may only confirm and reopen', () => {
    const moves: TicketMove[] = ['start', 'assign', 'request_info', 'resume', 'resolve', 'close'];
    for (const move of moves) {
      for (const status of STATUSES) {
        expect(canTicketMove(status, move, 'student')).toBe(false);
      }
    }
    expect(canTicketMove('awaiting_confirmation', 'confirm', 'student')).toBe(true);
    expect(canTicketMove('closed', 'reopen', 'student')).toBe(true);
    expect(canTicketMove('in_progress', 'reopen', 'student')).toBe(false);
  });

  it('an unknown status allows nothing', () => {
    expect(canTicketMove('banana', 'start', 'staff')).toBe(false);
  });
});

describe('canStudentReopenTicket', () => {
  it('always while awaiting confirmation', () => {
    expect(canStudentReopenTicket({ status: 'awaiting_confirmation', closed_at: null }, NOW)).toBe(true);
  });

  it('within 7 days of closed_at', () => {
    const closed_at = new Date(NOW - 7 * DAY).toISOString();
    expect(canStudentReopenTicket({ status: 'closed', closed_at }, NOW)).toBe(true);
  });

  it('not after 7 days', () => {
    const closed_at = new Date(NOW - 7 * DAY - 1000).toISOString();
    expect(canStudentReopenTicket({ status: 'closed', closed_at }, NOW)).toBe(false);
  });

  it('not when closed_at is missing (old tickets the backfill closed)', () => {
    expect(canStudentReopenTicket({ status: 'closed', closed_at: null }, NOW)).toBe(false);
  });

  it('not from an active status', () => {
    expect(canStudentReopenTicket({ status: 'in_progress', closed_at: null }, NOW)).toBe(false);
  });
});

describe('outcomes', () => {
  it('staff may not send no_response', () => {
    expect(isTicketStaffOutcome('no_response')).toBe(false);
  });

  it('every listed outcome is accepted', () => {
    for (const o of TICKET_STAFF_OUTCOMES) expect(isTicketStaffOutcome(o.code)).toBe(true);
  });

  it('rejects junk', () => {
    expect(isTicketStaffOutcome('')).toBe(false);
    expect(isTicketStaffOutcome(undefined)).toBe(false);
  });
});

describe('ticketActionsFor', () => {
  it('every button is a move the server allows', () => {
    for (const status of STATUSES) {
      for (const action of ticketActionsFor(status)) {
        expect(canTicketMove(status, action.move, 'staff'), `${status} ${action.move}`).toBe(true);
      }
    }
  });

  it('exactly one primary button per status, listed first', () => {
    for (const status of STATUSES) {
      const actions = ticketActionsFor(status);
      expect(actions.filter((a) => a.primary)).toHaveLength(1);
      expect(actions[0].primary).toBe(true);
    }
  });

  it('a closed ticket can be reopened (the missing button)', () => {
    expect(ticketActionsFor('closed').map((a) => a.move)).toEqual(['reopen']);
  });

  it('new tickets lead with Start, in progress with Resolve', () => {
    expect(ticketActionsFor('open')[0].move).toBe('start');
    expect(ticketActionsFor('in_progress')[0].move).toBe('resolve');
    expect(ticketActionsFor('waiting_on_student')[0].move).toBe('resume');
    expect(ticketActionsFor('awaiting_confirmation')[0].move).toBe('confirm');
  });

  it('labels carry no em dashes', () => {
    for (const status of STATUSES) {
      for (const a of ticketActionsFor(status)) expect(a.label).not.toMatch(/—|--/);
    }
  });
});

describe('queues', () => {
  it('every status lands in exactly one staff queue', () => {
    for (const status of STATUSES) {
      const queue = ticketStaffQueueOf(status);
      expect(TICKET_QUEUE_STATUSES[queue]).toContain(status);
    }
  });

  it('student queues follow whose turn it is', () => {
    expect(ticketStudentQueueOf('waiting_on_student')).toBe('needs_you');
    expect(ticketStudentQueueOf('awaiting_confirmation')).toBe('needs_you');
    expect(ticketStudentQueueOf('open')).toBe('active');
    expect(ticketStudentQueueOf('in_progress')).toBe('active');
    expect(ticketStudentQueueOf('closed')).toBe('closed');
  });
});

describe('time', () => {
  it('clocks match the cron windows', () => {
    expect(TICKET_CONFIRM_DAYS).toBe(3);
    expect(TICKET_WAITING_DAYS).toBe(7);
  });

  it('closesInText', () => {
    expect(ticketClosesInText(null, NOW)).toBeNull();
    expect(ticketClosesInText(new Date(NOW - DAY).toISOString(), NOW)).toBe('closes today');
    expect(ticketClosesInText(new Date(NOW + DAY).toISOString(), NOW)).toBe('closes in 1 day');
    expect(ticketClosesInText(ticketDaysFromNow(3, NOW), NOW)).toBe('closes in 3 days');
  });

  it('daysUntil ignores junk', () => {
    expect(ticketDaysUntil('not a date', NOW)).toBeNull();
  });
});
