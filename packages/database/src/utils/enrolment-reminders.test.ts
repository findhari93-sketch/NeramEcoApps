import { describe, it, expect } from 'vitest';
import { planEnrolmentReminders, type ReminderLinkRow } from './enrolment-reminders';

/**
 * Unpaid student-pays links get a nudge on day 1, on day 3, and 2 days before
 * they expire; an expired link is closed and both sides are told. Pinned:
 * each nudge fires once, nothing fires after a submission, and the plan is
 * pure (no clock inside).
 */
const NOW = new Date('2026-10-20T04:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000).toISOString();
const hoursAhead = (h: number) => new Date(NOW.getTime() + h * 3600 * 1000).toISOString();

const link = (over: Partial<ReminderLinkRow> = {}): ReminderLinkRow => ({
  id: 'l1',
  status: 'active',
  payment_mode: 'student_pays',
  created_at: hoursAgo(30),
  expires_at: hoursAhead(24 * 12),
  submitted_at: null,
  reminder_count: 0,
  last_reminder_at: null,
  ...over,
});

describe('planEnrolmentReminders', () => {
  it('sends the day-1 nudge once a link is a day old and untouched', () => {
    expect(planEnrolmentReminders([link()], NOW)).toEqual([{ linkId: 'l1', action: 'remind', stage: 'day1' }]);
  });

  it('does nothing in the first 24 hours', () => {
    expect(planEnrolmentReminders([link({ created_at: hoursAgo(10) })], NOW)).toEqual([]);
  });

  it('does not repeat the day-1 nudge', () => {
    expect(planEnrolmentReminders([link({ reminder_count: 1, last_reminder_at: hoursAgo(5) })], NOW)).toEqual([]);
  });

  it('sends the day-3 nudge after three days, once', () => {
    expect(planEnrolmentReminders([link({ created_at: hoursAgo(80), reminder_count: 1, last_reminder_at: hoursAgo(50) })], NOW)).toEqual([{ linkId: 'l1', action: 'remind', stage: 'day3' }]);
    expect(planEnrolmentReminders([link({ created_at: hoursAgo(80), reminder_count: 2, last_reminder_at: hoursAgo(5) })], NOW)).toEqual([]);
  });

  it('sends the last-chance nudge two days before expiry, once, at least a day after the previous one', () => {
    expect(planEnrolmentReminders([link({ created_at: hoursAgo(24 * 12), expires_at: hoursAhead(40), reminder_count: 2, last_reminder_at: hoursAgo(24 * 9) })], NOW)).toEqual([
      { linkId: 'l1', action: 'remind', stage: 'last_chance' },
    ]);
    expect(planEnrolmentReminders([link({ created_at: hoursAgo(24 * 12), expires_at: hoursAhead(40), reminder_count: 3, last_reminder_at: hoursAgo(20) })], NOW)).toEqual([]);
    // Day-3 sent only 6 hours ago: wait, do not stack nudges.
    expect(planEnrolmentReminders([link({ created_at: hoursAgo(80), expires_at: hoursAhead(40), reminder_count: 2, last_reminder_at: hoursAgo(6) })], NOW)).toEqual([]);
  });

  it('closes an expired link instead of nudging', () => {
    expect(planEnrolmentReminders([link({ expires_at: hoursAgo(1) })], NOW)).toEqual([{ linkId: 'l1', action: 'expire' }]);
  });

  it('leaves alone anything submitted, used, recorded-mode or not active', () => {
    expect(planEnrolmentReminders([link({ submitted_at: hoursAgo(2) })], NOW)).toEqual([]);
    expect(planEnrolmentReminders([link({ status: 'payment_submitted' })], NOW)).toEqual([]);
    expect(planEnrolmentReminders([link({ status: 'used' })], NOW)).toEqual([]);
    expect(planEnrolmentReminders([link({ payment_mode: 'recorded' })], NOW)).toEqual([]);
  });
});
