// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb, type FakeDb } from './payments/test-fake-db';

/**
 * The reminders runner applies the pure plan: nudge emails with the payment
 * details, the expiry of a dead link with an email to the student and a bell
 * for staff. Pinned: counters move only when an email actually went, a link
 * with no email address is left alone, and a failing send never stops the rest.
 */
const remind = vi.fn(async () => ({ success: true }));
const expired = vi.fn(async () => ({ success: true }));
const bell = vi.fn(async () => undefined);
const logEvent = vi.fn(async () => undefined);
vi.mock('./enrolment-payment-email', () => ({
  sendEnrolmentReminderEmail: (...a: unknown[]) => remind(...(a as [])),
  sendLinkExpiredEmail: (...a: unknown[]) => expired(...(a as [])),
}));
vi.mock('../queries/notifications', () => ({ createAdminNotification: (...a: unknown[]) => bell(...(a as [])) }));
vi.mock('../queries/direct-enrollment', () => ({ logDirectEnrollmentLinkEvent: (...a: unknown[]) => logEvent(...(a as [])) }));
vi.mock('../queries/payment-payee', () => ({
  getPaymentPayee: async () => ({ upiId: 'x@okicici', payeeName: 'Manoharan Trust', gpayNumber: null, bank: { accountName: 'T', accountNumber: '1', ifsc: 'KVBL0001928', bankName: 'KVB', branch: 'P' }, accessUntilLabel: 'Sep 2027', whatsappNumber: null }),
}));

import { runEnrolmentReminders } from './enrolment-reminders';

const NOW = new Date('2026-10-20T04:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000).toISOString();
const hoursAhead = (h: number) => new Date(NOW.getTime() + h * 3600 * 1000).toISOString();

const link = (over: any = {}) => ({
  id: 'l1',
  token: 'tok1',
  status: 'active',
  payment_mode: 'student_pays',
  student_name: 'Radhika K',
  student_email: 'r@example.com',
  interest_course: 'nata',
  created_at: hoursAgo(30),
  expires_at: hoursAhead(24 * 12),
  submitted_at: null,
  reminder_count: 0,
  last_reminder_at: null,
  chosen_scheme: null,
  total_fee: 30000,
  discount_amount: 0,
  offer_full_amount: 25000,
  offer_installment_1: 16500,
  offer_installment_2: 13500,
  offer_balance_due_days: 45,
  ...over,
});

let db: FakeDb;
beforeEach(() => {
  remind.mockClear().mockResolvedValue({ success: true });
  expired.mockClear().mockResolvedValue({ success: true });
  bell.mockClear();
  logEvent.mockClear();
});

describe('runEnrolmentReminders', () => {
  it('emails the day-1 nudge with the payment details and counts it', async () => {
    db = fakeDb({ direct_enrollment_links: [link()] });
    const r = await runEnrolmentReminders(db.client, { siteUrl: 'https://neramclasses.com', now: NOW });
    expect(r).toMatchObject({ reminded: 1, expired: 0, skipped: 0 });
    expect(remind).toHaveBeenCalledTimes(1);
    const [to, facts] = remind.mock.calls[0] as any[];
    expect(to).toBe('r@example.com');
    expect(facts).toMatchObject({ stage: 'day1', studentName: 'Radhika K', resumeUrl: expect.stringContaining('tok1'), qrPngUrl: expect.stringContaining('/api/enroll/qr?token=tok1') });
    expect(facts.offerLines[0]).toMatch(/25,000/);
    expect(db.rows('direct_enrollment_links')[0]).toMatchObject({ reminder_count: 1 });
    expect(db.rows('direct_enrollment_links')[0].last_reminder_at).toBeTruthy();
    expect(logEvent).toHaveBeenCalledWith('l1', 'reminder_sent', null, expect.objectContaining({ stage: 'day1' }), db.client);
  });

  it('leaves a link with no email address alone and says so', async () => {
    db = fakeDb({ direct_enrollment_links: [link({ student_email: null })] });
    const r = await runEnrolmentReminders(db.client, { siteUrl: 'https://neramclasses.com', now: NOW });
    expect(r.skipped).toBe(1);
    expect(remind).not.toHaveBeenCalled();
    expect(db.rows('direct_enrollment_links')[0].reminder_count).toBe(0);
  });

  it('does not count a nudge the mail service refused', async () => {
    remind.mockResolvedValueOnce({ success: false, error: 'bounce' });
    db = fakeDb({ direct_enrollment_links: [link()] });
    const r = await runEnrolmentReminders(db.client, { siteUrl: 'https://neramclasses.com', now: NOW });
    expect(r.reminded).toBe(0);
    expect(db.rows('direct_enrollment_links')[0].reminder_count).toBe(0);
  });

  it('expires a dead link, tells the student and rings the staff bell', async () => {
    db = fakeDb({ direct_enrollment_links: [link({ expires_at: hoursAgo(2) })] });
    const r = await runEnrolmentReminders(db.client, { siteUrl: 'https://neramclasses.com', now: NOW });
    expect(r.expired).toBe(1);
    expect(db.rows('direct_enrollment_links')[0].status).toBe('expired');
    expect(expired).toHaveBeenCalledTimes(1);
    expect(bell).toHaveBeenCalledTimes(1);
    expect((bell.mock.calls[0] as any[])[0].title).toMatch(/expired/i);
    expect(logEvent).toHaveBeenCalledWith('l1', 'expired', null, expect.anything(), db.client);
  });

  it('a link another sweep already expired still gets the student email and the staff bell, once', async () => {
    db = fakeDb({ direct_enrollment_links: [link({ status: 'expired', expires_at: hoursAgo(5) })], direct_enrollment_link_events: [] });
    const first = await runEnrolmentReminders(db.client, { siteUrl: 'https://neramclasses.com', now: NOW });
    expect(first.expired).toBe(1);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(bell).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith('l1', 'expired', null, expect.anything(), db.client);
    // The event is now on record: a second run is quiet.
    db.rows('direct_enrollment_link_events').push({ link_id: 'l1', kind: 'expired' });
    const second = await runEnrolmentReminders(db.client, { siteUrl: 'https://neramclasses.com', now: NOW });
    expect(second.expired).toBe(0);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('one failing link does not stop the others', async () => {
    remind.mockRejectedValueOnce(new Error('smtp down'));
    db = fakeDb({ direct_enrollment_links: [link({ id: 'l1' }), link({ id: 'l2', token: 'tok2' })] });
    const r = await runEnrolmentReminders(db.client, { siteUrl: 'https://neramclasses.com', now: NOW });
    expect(r.reminded).toBe(1);
    expect(r.failed).toBe(1);
  });
});
