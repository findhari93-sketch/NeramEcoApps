import { describe, it, expect, vi } from 'vitest';

vi.mock('@neram/database', () => ({
  createAdminClient: () => ({}),
  formatDueDate: (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
}));
vi.mock('@neram/database/fee-payment-claims', () => ({ loadBalanceDue: async () => null }));

import { describePaymentOptions, NO_PAYMENT_OPTIONS, paymentActions, type PaymentOptions } from './payments';

const ALL: PaymentOptions = {
  balance: { amount: 13500, installmentNumber: 2, dueDate: '2026-11-05', balance: 13500 },
  pendingClaim: null,
  approvedApplication: { number: 'NERAM-2026-0042', fee: 30000 },
  enrolmentLink: { token: 'secret-token-123', amount: 25000, expiresAt: '2026-11-01T00:00:00Z' },
};

describe('paymentActions', () => {
  it('lists every payment, the enrolment link first, with the page for each', () => {
    expect(paymentActions(ALL, true)).toEqual([
      { id: 'link', label: 'Finish your enrolment and pay ₹25,000', href: '/enroll?token=secret-token-123' },
      { id: 'application', label: 'Pay the course fee (₹30,000)', href: '/pay?app=NERAM-2026-0042' },
      { id: 'balance', label: 'Pay ₹13,500 (instalment 2, due 5 Nov 2026)', href: '/pay-balance' },
    ]);
  });

  it('keeps the enrolment link token out unless asked for the card', () => {
    expect(paymentActions(ALL)[0].href).toBeNull();
    expect(JSON.stringify(describePaymentOptions(ALL))).not.toContain('secret-token-123');
  });

  it('does not ask for the balance again while their last payment waits for our team', () => {
    const waiting = { ...ALL, enrolmentLink: null, approvedApplication: null, pendingClaim: { amount: 13500, submittedAt: null } };
    expect(paymentActions(waiting, true)).toEqual([]);
    expect(describePaymentOptions(waiting)).toMatchObject({ owes_now: 'nothing right now', waiting_for_our_team: expect.stringContaining('₹13,500') });
  });

  it('says plainly when nothing is due', () => {
    expect(describePaymentOptions(NO_PAYMENT_OPTIONS)).toMatchObject({ owes_now: 'nothing right now' });
  });
});
