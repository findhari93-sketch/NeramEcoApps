import { describe, expect, it } from 'vitest';
import {
  CHECK_MESSAGE,
  deliveryChannel,
  deliveryLanded,
  deliverySummary,
  installmentReminderMessage,
  resolutionMessage,
} from './fee-check-copy';

const counts = (c: Partial<{ chat: number; teams: number; inapp: number; skipped: number }>) => ({
  chat: 0,
  teams: 0,
  inapp: 0,
  skipped: 0,
  ...c,
});

const DASHES = /—|–|--/;

describe('deliveryChannel', () => {
  it('names the best channel that landed', () => {
    expect(deliveryChannel(counts({ chat: 1, inapp: 1 }))).toBe('chat');
    expect(deliveryChannel(counts({ teams: 1, inapp: 1 }))).toBe('teams');
    expect(deliveryChannel(counts({ inapp: 1 }))).toBe('inapp');
    expect(deliveryChannel(counts({ skipped: 1 }))).toBe('dormant');
    expect(deliveryChannel(counts({}))).toBe('failed');
  });

  it('counts the bell as landed, a paused student or a failure as not', () => {
    expect(deliveryLanded('inapp')).toBe(true);
    expect(deliveryLanded('dormant')).toBe(false);
    expect(deliveryLanded('failed')).toBe(false);
  });
});

describe('deliverySummary', () => {
  it('tells staff in one plain sentence what happened', () => {
    expect(deliverySummary('chat')).toBe('Sent in Teams.');
    expect(deliverySummary('teams')).toBe('Sent in Teams.');
    expect(deliverySummary('inapp')).toBe('Waiting in their Nexus bell.');
    expect(deliverySummary('dormant')).toBe('Not sent: this student is paused.');
    expect(deliverySummary('failed')).toMatch(/^Not sent/);
  });
});

describe('student copy', () => {
  it('addresses the student by first name and carries no dashes', () => {
    expect(CHECK_MESSAGE.plain).toContain('{firstName}');
    for (const text of Object.values(CHECK_MESSAGE)) expect(text).not.toMatch(DASHES);
  });

  it('says what the office did with a report', () => {
    expect(resolutionMessage({ status: 'accepted' }).plain).toContain('the office has updated your fees. Please check them again.');
    const rejected = resolutionMessage({ status: 'rejected', resolution_note: 'We have no record of a payment on 3 Oct.' });
    expect(rejected.plain).toContain('kept your fees as they are');
    expect(rejected.plain).toContain('We have no record of a payment on 3 Oct.');
    expect(resolutionMessage({ status: 'rejected', resolution_note: '  ' }).plain).not.toContain('Their note');
    expect(rejected.plain).not.toMatch(DASHES);
  });

  it('words the installment reminder for 3 days before and for the day', () => {
    const upcoming = installmentReminderMessage({ kind: 'upcoming', amount: 15000, dueDate: '2026-10-19' });
    expect(upcoming.plain).toBe(
      'Hi {firstName}, your second installment of ₹15,000 is due on 19 Oct 2026. Tap Pay now to pay by UPI or bank transfer. Already paid at the office? You can ignore this.',
    );
    const today = installmentReminderMessage({ kind: 'due_today', amount: 15000, dueDate: '2026-10-19' });
    expect(today.plain).toContain('is due today.');
    expect(today.linkLabel).toBe('Pay now');
  });
});
