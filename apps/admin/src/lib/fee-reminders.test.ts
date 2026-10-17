// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildFeeView } from '@neram/database/fee-plan';
import {
  planStaffFeeReminders,
  staffReminderNotification,
  staffReminderSummary,
  dueWords,
  type StaffReminderStudent,
} from './fee-reminders';

// 16 Oct 2026, 09:30 IST.
const NOW = new Date('2026-10-16T04:00:00Z');

function student(
  userId: string,
  name: string,
  dueDate: string,
  opts: { paid?: number; isAlumni?: boolean; hasOpenReport?: boolean } = {},
): StaffReminderStudent {
  const view = buildFeeView({
    lead: { id: `lead-${userId}`, user_id: userId, final_fee: 30000, payment_scheme: 'installment' },
    payments: [{ id: `p-${userId}`, user_id: userId, amount: opts.paid ?? 15000, status: 'paid', paid_at: '2026-07-01T00:00:00+05:30' }],
    installments: [
      { id: `i1-${userId}`, lead_profile_id: `lead-${userId}`, installment_number: 1, amount: 15000, due_date: '2026-07-01', status: 'paid' },
      { id: `i2-${userId}`, lead_profile_id: `lead-${userId}`, installment_number: 2, amount: 15000, due_date: dueDate, status: 'pending' },
    ],
  });
  return { userId, name, view, isAlumni: opts.isAlumni, hasOpenReport: opts.hasOpenReport };
}

describe('planStaffFeeReminders', () => {
  it('plans upcoming, due today and overdue reminders with the student name', () => {
    const planned = planStaffFeeReminders(
      [
        student('a', 'Rayna Choudhary', '2026-10-19'),
        student('b', 'Arun', '2026-10-16'),
        student('c', 'Bala', '2026-10-11'),
        student('d', 'Far Away', '2026-11-30'),
      ],
      NOW,
    );
    const byUser = Object.fromEntries(planned.map((p) => [p.userId, p]));
    expect(byUser.a.kind).toBe('upcoming');
    expect(byUser.a.name).toBe('Rayna Choudhary');
    expect(byUser.a.amount).toBe(15000);
    expect(byUser.b.kind).toBe('due_today');
    expect(byUser.c.kind).toBe('overdue');
    expect(byUser.d).toBeUndefined();
  });

  it('skips paid, alumni students; staff still hear about a student with an open report', () => {
    const planned = planStaffFeeReminders(
      [
        student('paid', 'Paid', '2026-10-16', { paid: 30000 }),
        student('alum', 'Alum', '2026-10-16', { isAlumni: true }),
        student('rep', 'Reported', '2026-10-16', { hasOpenReport: true }),
      ],
      NOW,
    );
    expect(planned.map((p) => p.userId)).toEqual(['rep']);
  });

  it('gives every reminder a dedupe key with the due date, so a moved date re-arms it', () => {
    const [first] = planStaffFeeReminders([student('a', 'A', '2026-10-17')], NOW);
    const [moved] = planStaffFeeReminders([student('a', 'A', '2026-10-18')], NOW);
    expect(first.dedupeKey).not.toBe(moved.dedupeKey);
    expect(first.dedupeKey).toContain('2026-10-17');
  });

  it('falls back to "A student" when the name is blank', () => {
    const [r] = planStaffFeeReminders([student('a', '  ', '2026-10-16')], NOW);
    expect(r.name).toBe('A student');
  });
});

describe('staff copy', () => {
  it('says when in plain words', () => {
    expect(dueWords(3)).toBe('due in 3 days');
    expect(dueWords(1)).toBe('due tomorrow');
    expect(dueWords(0)).toBe('due today');
    expect(dueWords(-1)).toBe('overdue by 1 day');
    expect(dueWords(-5)).toBe('overdue by 5 days');
    expect(dueWords(-21)).toBe('overdue by 3 weeks');
  });

  it('builds a bell entry that links to the student and carries no dashes', () => {
    const [r] = planStaffFeeReminders([student('u1', 'Rayna Choudhary', '2026-10-19')], NOW);
    const n = staffReminderNotification(r);
    expect(n.event_type).toBe('fee_installment_due');
    expect(n.title).toBe('Rayna Choudhary: ₹15,000 due in 3 days');
    expect(n.metadata.user_id).toBe('u1');
    expect(n.metadata.installment_id).toBe('i2-u1');
    expect(n.metadata.link).toBe('/crm/u1?section=application');
    expect(`${n.title} ${n.message}`).not.toMatch(/—|--/);
  });

  it('uses the overdue event for overdue reminders', () => {
    const [r] = planStaffFeeReminders([student('u1', 'Bala', '2026-10-01')], NOW);
    expect(r.kind).toBe('overdue_weekly');
    expect(staffReminderNotification(r).event_type).toBe('fee_installment_overdue');
  });
});

describe('staffReminderSummary', () => {
  it('sends nothing when nothing was claimed (a rerun of the same day)', () => {
    expect(staffReminderSummary([], NOW)).toBeNull();
  });

  it('is one push for the whole run, tagged by the IST date', () => {
    const s = staffReminderSummary(
      [
        { kind: 'upcoming', amount: 15000 },
        { kind: 'upcoming', amount: 10000 },
        { kind: 'due_today', amount: 5000 },
        { kind: 'overdue_weekly', amount: 20000 },
      ],
      NOW,
    )!;
    expect(s.title).toBe('Fees to collect: ₹50,000');
    expect(s.body).toBe('2 due in the next few days, 1 due today, 1 overdue. Open Collections to see who.');
    expect(s.url).toBe('/collections?filter=due');
    expect(s.tag).toBe('fees-2026-10-16');
  });
});
