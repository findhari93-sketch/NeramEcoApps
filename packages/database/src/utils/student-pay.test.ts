import { describe, it, expect } from 'vitest';
import {
  buildStudentPayOffer,
  offerFromLink,
  amountDueToday,
  normaliseTransactionRef,
  paymentReference,
  buildUpiUri,
  parsePaymentPayee,
  validatePaymentPayee,
  DEFAULT_PAYMENT_PAYEE,
  offerLines,
} from './student-pay';

/**
 * What a student is asked to pay. A wrong rupee here is a real family paying
 * the wrong amount into the trust account, so the 1-Year structure is pinned.
 */
const ONE_YEAR = { fee_amount: '30000.00', single_payment_discount: '5000.00', installment_1_amount: '16500.00', installment_2_amount: '13500.00' };

describe('buildStudentPayOffer', () => {
  it('1-Year: 25,000 in full, or 16,500 + 13,500', () => {
    const o = buildStudentPayOffer(ONE_YEAR);
    expect(o.fullAmount).toBe(25000);
    expect(o.installment1).toBe(16500);
    expect(o.installment2).toBe(13500);
    expect(o.installmentTotal).toBe(30000);
    expect(o.savings).toBe(5000);
    expect(o.allowsInstallments).toBe(true);
  });

  it('an extra discount comes off both plans, and off the second installment', () => {
    const o = buildStudentPayOffer(ONE_YEAR, 2000);
    expect(o.fullAmount).toBe(23000);
    expect(o.installment1).toBe(16500);
    expect(o.installment2).toBe(11500);
    expect(o.savings).toBe(5000);
  });

  it('no installment figure means full payment only', () => {
    const o = buildStudentPayOffer({ fee_amount: 15000, single_payment_discount: 0, installment_1_amount: null });
    expect(o.allowsInstallments).toBe(false);
    expect(o.installment1).toBeNull();
    expect(o.fullAmount).toBe(15000);
    expect(o.savings).toBe(0);
  });

  it('a discount that swallows installment 2 drops the installment plan', () => {
    const o = buildStudentPayOffer(ONE_YEAR, 13500);
    expect(o.allowsInstallments).toBe(false);
    expect(o.fullAmount).toBe(11500);
  });

  it('never goes negative', () => {
    const o = buildStudentPayOffer(ONE_YEAR, 99999);
    expect(o.fullAmount).toBe(0);
  });
});

describe('offerFromLink / amountDueToday', () => {
  const link = { total_fee: 30000, discount_amount: 0, offer_full_amount: '25000', offer_installment_1: '16500', offer_installment_2: '13500' };

  it('reads the snapshot back', () => {
    const o = offerFromLink(link);
    expect(amountDueToday(o, 'full')).toBe(25000);
    expect(amountDueToday(o, 'installment')).toBe(16500);
    expect(o.savings).toBe(5000);
  });

  it('refuses installments the link does not offer', () => {
    const o = offerFromLink({ ...link, offer_installment_1: null, offer_installment_2: null });
    expect(amountDueToday(o, 'installment')).toBeNull();
    expect(amountDueToday(o, 'full')).toBe(25000);
  });
});

describe('normaliseTransactionRef', () => {
  it('UPI: exactly 12 digits, spaces allowed while typing', () => {
    expect(normaliseTransactionRef('4123 4567 8901', 'upi_direct')).toBe('412345678901');
    expect(normaliseTransactionRef('41234567890', 'upi_direct')).toBeNull();
    expect(normaliseTransactionRef('41234567890A', 'upi_direct')).toBeNull();
    expect(normaliseTransactionRef(undefined, 'upi_direct')).toBeNull();
  });

  it('bank: 12 to 22 letters and digits, upper-cased', () => {
    expect(normaliseTransactionRef('kkbkh26291123456', 'bank_transfer')).toBe('KKBKH26291123456');
    expect(normaliseTransactionRef('412345678901', 'bank_transfer')).toBe('412345678901');
    expect(normaliseTransactionRef('SHORT1', 'bank_transfer')).toBeNull();
  });
});

describe('buildUpiUri', () => {
  it('keeps @ readable, encodes the name and note, fixes 2 decimals', () => {
    const uri = buildUpiUri({ vpa: 'neramclassroom-1@okhdfcbank', payeeName: 'Manoharan Trust', amount: 25000, note: 'NRM 4F2A9C' });
    expect(uri).toBe('upi://pay?pa=neramclassroom-1@okhdfcbank&pn=Manoharan%20Trust&am=25000.00&cu=INR&tn=NRM%204F2A9C');
  });

  it('omits the note when there is none', () => {
    expect(buildUpiUri({ vpa: 'a@b', payeeName: 'X', amount: 1 })).toBe('upi://pay?pa=a@b&pn=X&am=1.00&cu=INR');
  });
});

describe('paymentReference', () => {
  it('six characters of the link id', () => {
    expect(paymentReference('4f2a9c1e-0000-0000-0000-000000000000')).toBe('NRM 4F2A9C');
  });
});

describe('parsePaymentPayee / validatePaymentPayee', () => {
  it('fills blanks from the default', () => {
    const p = parsePaymentPayee({ upiId: '  ', bank: { ifsc: 'kvbl0001928' } });
    expect(p.upiId).toBe(DEFAULT_PAYMENT_PAYEE.upiId);
    expect(p.bank.ifsc).toBe('KVBL0001928');
    expect(p.accessUntilLabel).toBe('September 2027');
  });

  it('the default is valid', () => {
    expect(validatePaymentPayee(DEFAULT_PAYMENT_PAYEE)).toEqual({});
  });

  it('flags a bad UPI ID and IFSC', () => {
    const p = parsePaymentPayee({ upiId: 'not-a-vpa', bank: { ifsc: 'KVB1' } });
    const e = validatePaymentPayee(p);
    expect(e.upiId).toBeTruthy();
    expect(e.ifsc).toBeTruthy();
  });
});

describe('offerLines', () => {
  it('reads like the WhatsApp message', () => {
    expect(offerLines(buildStudentPayOffer(ONE_YEAR), '3 Dec 2026')).toEqual([
      'Pay in full: ₹25,000 (save ₹5,000)',
      'Or two installments: ₹16,500 now, ₹13,500 by 3 Dec 2026',
    ]);
  });
});
