import { describe, it, expect } from 'vitest';
import {
  checkEnrolmentPlan,
  defaultBalanceDueDate,
  enrolmentLinkUrl,
  enrolmentPlanLines,
  enrolmentShareMessage,
} from './enrolment-link';

const TODAY = '2026-10-17';
const field = (r: ReturnType<typeof checkEnrolmentPlan>, f: string) => r.errors.find((e) => e.field === f)?.message;

describe('checkEnrolmentPlan', () => {
  it('works out the balance for two installments (₹15,000 of ₹30,000)', () => {
    const r = checkEnrolmentPlan(
      { totalFee: 30000, scheme: 'installment', amountPaid: 15000, paymentDate: '2026-10-16', balanceDueDate: '2026-11-30' },
      TODAY,
    );
    expect(r.errors).toEqual([]);
    expect(r.finalFee).toBe(30000);
    expect(r.paid).toBe(15000);
    expect(r.balance).toBe(15000);
  });

  it('takes the discount off before the balance', () => {
    const r = checkEnrolmentPlan(
      { totalFee: 30000, discount: 2000, scheme: 'installment', amountPaid: 14000, paymentDate: '2026-10-16', balanceDueDate: '2026-11-30' },
      TODAY,
    );
    expect(r.finalFee).toBe(28000);
    expect(r.balance).toBe(14000);
    expect(r.errors).toEqual([]);
  });

  it('accepts numbers typed as strings with commas', () => {
    const r = checkEnrolmentPlan({ totalFee: '30,000', scheme: 'full', amountPaid: '30000' }, TODAY);
    expect(r.errors).toEqual([]);
    expect(r.balance).toBe(0);
  });

  it('refuses paid in full when less than the fee was paid', () => {
    const r = checkEnrolmentPlan({ totalFee: 30000, scheme: 'full', amountPaid: 15000 }, TODAY);
    expect(field(r, 'amountPaid')).toMatch(/Choose Two installments/);
  });

  it('refuses two installments that already cover the whole fee', () => {
    const r = checkEnrolmentPlan(
      { totalFee: 30000, scheme: 'installment', amountPaid: 30000, balanceDueDate: '2026-11-30' },
      TODAY,
    );
    expect(field(r, 'amountPaid')).toMatch(/Paid in full/);
  });

  it('needs a due date for the balance', () => {
    const r = checkEnrolmentPlan({ totalFee: 30000, scheme: 'installment', amountPaid: 15000 }, TODAY);
    expect(field(r, 'balanceDueDate')).toBeTruthy();
  });

  it('refuses a balance due before the payment date', () => {
    const r = checkEnrolmentPlan(
      { totalFee: 30000, scheme: 'installment', amountPaid: 15000, paymentDate: '2026-10-16', balanceDueDate: '2026-10-01' },
      TODAY,
    );
    expect(field(r, 'balanceDueDate')).toMatch(/payment date/);
  });

  it('refuses a payment date in the future', () => {
    const r = checkEnrolmentPlan({ totalFee: 30000, scheme: 'full', amountPaid: 30000, paymentDate: '2026-10-20' }, TODAY);
    expect(field(r, 'paymentDate')).toBeTruthy();
  });

  it('needs a total fee and an amount', () => {
    const r = checkEnrolmentPlan({ totalFee: '', scheme: 'full', amountPaid: '' }, TODAY);
    expect(field(r, 'totalFee')).toBeTruthy();
    expect(field(r, 'amountPaid')).toBeTruthy();
  });
});

describe('defaultBalanceDueDate', () => {
  it('is 45 days after payment by default', () => {
    expect(defaultBalanceDueDate('2026-10-16')).toBe('2026-11-30');
  });
  it('uses the fee structure days when given', () => {
    expect(defaultBalanceDueDate('2026-10-16', 30)).toBe('2026-11-15');
  });
});

describe('enrolmentLinkUrl', () => {
  it('builds the marketing enrol URL for the environment', () => {
    expect(enrolmentLinkUrl('abc_123', 'https://staging.neramclasses.com/')).toBe(
      'https://staging.neramclasses.com/en/enroll?token=abc_123',
    );
  });
  it('falls back to production', () => {
    expect(enrolmentLinkUrl('t')).toBe('https://neramclasses.com/en/enroll?token=t');
  });
});

describe('share text', () => {
  const input = {
    studentName: 'Eeshal K',
    url: 'https://neramclasses.com/en/enroll?token=t',
    finalFee: 30000,
    amountPaid: 15000,
    scheme: 'installment' as const,
    balanceDueDate: '2026-11-30',
    expiresAt: '2026-10-24T15:46:31Z',
  };

  it('lists the fee, the payment and the balance with its date', () => {
    const lines = enrolmentPlanLines(input);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('₹15,000');
    expect(lines[2]).toContain('30 Nov 2026');
  });

  it('leaves out the balance when paid in full', () => {
    expect(enrolmentPlanLines({ ...input, scheme: 'full', amountPaid: 30000 })).toHaveLength(2);
  });

  it('greets by first name, carries the URL, and never uses dashes as punctuation', () => {
    const text = enrolmentShareMessage(input);
    expect(text).toMatch(/^Hi Eeshal,/);
    expect(text).toContain(input.url);
    expect(text).toContain('24 Oct 2026');
    expect(text).not.toMatch(/—|--|&mdash;/);
  });
});
