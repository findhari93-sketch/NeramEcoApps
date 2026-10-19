import { describe, it, expect } from 'vitest';
import {
  balanceAfterClaim,
  claimInstallmentLabel,
  rejectedMessage,
  submittedAgo,
  verifiedMessage,
} from './fee-claims-view';

describe('verifiedMessage', () => {
  it('says the receipt, who it was emailed to and what is left', () => {
    expect(verifiedMessage({ receiptNumber: 'NC-2026-0042', emailedTo: 'radhika@example.com', balanceAfter: 13500 })).toBe(
      'Recorded. Receipt NC-2026-0042 emailed to radhika@example.com. Balance left ₹13,500.',
    );
  });

  it('says fully paid when nothing is left', () => {
    expect(verifiedMessage({ receiptNumber: 'R1', emailedTo: 'a@b.c', balanceAfter: 0 })).toBe('Recorded. Receipt R1 emailed to a@b.c. Fully paid now.');
  });

  it('is honest when there is no email or no receipt number', () => {
    expect(verifiedMessage({ receiptNumber: null, emailedTo: null, balanceAfter: null })).toBe(
      'Recorded. The receipt was not emailed because there is no email on file.',
    );
  });
});

describe('rejectedMessage', () => {
  it('uses the first name', () => {
    expect(rejectedMessage('Radhika Kumar', 'r@x.com')).toBe('Payment rejected. Radhika was emailed the reason and can submit the payment again.');
    expect(rejectedMessage(null, null)).toMatch(/tell The student the reason yourself/);
  });
});

describe('balanceAfterClaim', () => {
  it('subtracts and never goes below zero', () => {
    expect(balanceAfterClaim(27000, 13500)).toBe(13500);
    expect(balanceAfterClaim(1000, 13500)).toBe(0);
    expect(balanceAfterClaim(null, 13500)).toBeNull();
  });
});

describe('claimInstallmentLabel', () => {
  it('names the installment or calls it a balance payment', () => {
    expect(claimInstallmentLabel(2)).toBe('Installment 2');
    expect(claimInstallmentLabel(null)).toBe('Balance payment');
  });
});

describe('submittedAgo', () => {
  const now = new Date('2026-10-19T10:00:00Z');
  it('reads minutes, hours and days', () => {
    expect(submittedAgo('2026-10-19T09:59:40Z', now)).toBe('just now');
    expect(submittedAgo('2026-10-19T09:55:00Z', now)).toBe('5 min ago');
    expect(submittedAgo('2026-10-19T07:00:00Z', now)).toBe('3 h ago');
    expect(submittedAgo('2026-10-18T09:00:00Z', now)).toBe('1 day ago');
    expect(submittedAgo('2026-10-16T09:00:00Z', now)).toBe('3 days ago');
    expect(submittedAgo(null, now)).toBe('');
  });
});
