import { describe, it, expect } from 'vitest';
import {
  buildStudentPayOffer,
  validateOfferOverrides,
  offerSnapshotColumns,
  offerFromLink,
  parsePaymentPayee,
  parsePaymentQrCodes,
  officialQrFor,
  parseEnrolmentLinkDays,
  DEFAULT_ENROLMENT_LINK_DAYS,
} from './student-pay';

/**
 * Phase 1 pricing: a fee structure is a preset; staff can adjust the quoted
 * fee, the pay-in-full price, the installments total and the first installment
 * for one student. Pinned: no overrides = today's numbers; the order
 * full <= installments total <= quoted; whole rupees; and the payee/QR settings.
 */
const oneYear = { fee_amount: 30000, single_payment_discount: 5000, installment_1_amount: 16500, installment_2_amount: 13500 };

describe('buildStudentPayOffer with overrides', () => {
  it('is unchanged without overrides (30,000 list, 25,000 in full, 16,500 + 13,500)', () => {
    const o = buildStudentPayOffer(oneYear, 0, undefined);
    expect(o).toMatchObject({ listFee: 30000, fullAmount: 25000, installmentTotal: 30000, installment1: 16500, installment2: 13500, savings: 5000, allowsInstallments: true });
  });

  it('quotes 33,000 with 30,000 in full: installments total the quoted fee', () => {
    const o = buildStudentPayOffer(oneYear, 0, { quotedFee: 33000, fullAmount: 30000 });
    expect(o).toMatchObject({ listFee: 33000, fullAmount: 30000, installmentTotal: 33000, installment1: 16500, installment2: 16500, savings: 3000 });
  });

  it('lets staff lower the installments total below the quoted fee', () => {
    const o = buildStudentPayOffer(oneYear, 0, { quotedFee: 33000, fullAmount: 30000, installmentTotal: 31000 });
    expect(o).toMatchObject({ installmentTotal: 31000, installment1: 16500, installment2: 14500, savings: 1000 });
  });

  it('two-year 40,000 quoted, 35,000 in full, 20,000 first', () => {
    const o = buildStudentPayOffer({ fee_amount: 35000, single_payment_discount: 5000, installment_1_amount: 18500 }, 0, { quotedFee: 40000, fullAmount: 35000, installment1: 20000 });
    expect(o).toMatchObject({ listFee: 40000, fullAmount: 35000, installmentTotal: 40000, installment1: 20000, installment2: 20000, savings: 5000 });
  });

  it('switches installments off when the first installment eats the total', () => {
    const o = buildStudentPayOffer(oneYear, 0, { installment1: 30000 });
    expect(o.allowsInstallments).toBe(false);
    expect(o.installment1).toBeNull();
  });
});

describe('validateOfferOverrides', () => {
  it('accepts a sane offer', () => {
    expect(validateOfferOverrides(buildStudentPayOffer(oneYear, 0, { quotedFee: 33000, fullAmount: 30000 }))).toEqual([]);
  });
  it('refuses pay-in-full above the installments total', () => {
    const errs = validateOfferOverrides(buildStudentPayOffer(oneYear, 0, { quotedFee: 33000, fullAmount: 34000 }));
    expect(errs.join(' ')).toMatch(/pay in full/i);
  });
  it('refuses pay-in-full above the installments total even when both sit under the quoted fee', () => {
    const errs = validateOfferOverrides(buildStudentPayOffer(oneYear, 0, { quotedFee: 33000, installmentTotal: 30000, fullAmount: 31000 }));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/two installments/i);
  });

  it('refuses an installments total above the quoted fee', () => {
    const errs = validateOfferOverrides(buildStudentPayOffer(oneYear, 0, { quotedFee: 30000, installmentTotal: 32000 }));
    expect(errs.join(' ')).toMatch(/quoted/i);
  });
  it('refuses paise', () => {
    const errs = validateOfferOverrides(buildStudentPayOffer(oneYear, 0, { fullAmount: 24999.5 }));
    expect(errs.join(' ')).toMatch(/whole rupees/i);
  });
  it('refuses a zero or negative price', () => {
    expect(validateOfferOverrides(buildStudentPayOffer(oneYear, 0, { fullAmount: 0 })).length).toBeGreaterThan(0);
  });
});

describe('offerSnapshotColumns', () => {
  it('writes the link columns that offerFromLink reads back as the same offer', () => {
    for (const ov of [undefined, { quotedFee: 33000, fullAmount: 30000 }, { quotedFee: 33000, fullAmount: 30000, installmentTotal: 31000 }, { quotedFee: 40000, fullAmount: 35000, installment1: 20000 }]) {
      const offer = buildStudentPayOffer(oneYear, 0, ov as any);
      const cols = offerSnapshotColumns(offer, 60);
      expect(cols.offer_balance_due_days).toBe(60);
      const back = offerFromLink(cols);
      expect(back).toMatchObject({ listFee: offer.listFee, fullAmount: offer.fullAmount, installmentTotal: offer.installmentTotal, installment1: offer.installment1, installment2: offer.installment2, savings: offer.savings, allowsInstallments: offer.allowsInstallments });
    }
  });
});

describe('payee and QR settings', () => {
  it('carries a WhatsApp number for proofs, blank when unset', () => {
    expect(parsePaymentPayee({}).whatsappNumber).toBeNull();
    expect(parsePaymentPayee({ whatsappNumber: ' +91 88074 37399 ' }).whatsappNumber).toBe('+91 88074 37399');
  });

  it('reads the official QR list and ignores junk rows', () => {
    const list = parsePaymentQrCodes([
      { amountPaise: 2500000, url: 'https://x/25000.png', label: '₹25,000' },
      { amountPaise: null, url: 'https://x/open.png' },
      { amountPaise: 'abc', url: '' },
      'nope',
    ]);
    expect(list).toEqual([
      { amountPaise: 2500000, url: 'https://x/25000.png', label: '₹25,000' },
      { amountPaise: null, url: 'https://x/open.png', label: null },
    ]);
    expect(parsePaymentQrCodes(undefined)).toEqual([]);
  });

  it('keeps only https image links, never javascript: or data: URLs', () => {
    const list = parsePaymentQrCodes([
      { amountPaise: 2500000, url: 'javascript:alert(1)' },
      { amountPaise: 2500000, url: 'data:image/png;base64,AAAA' },
      { amountPaise: 2500000, url: 'http://x/plain.png' },
      { amountPaise: 2500000, url: 'https://x/ok.png' },
    ]);
    expect(list.map((q) => q.url)).toEqual(['https://x/ok.png']);
  });

  it('picks the official QR only for the exact amount', () => {
    const list = parsePaymentQrCodes([{ amountPaise: 2500000, url: 'https://x/a.png' }, { amountPaise: 1650000, url: 'https://x/b.png' }, { amountPaise: null, url: 'https://x/open.png' }]);
    expect(officialQrFor(list, 2500000)?.url).toBe('https://x/a.png');
    expect(officialQrFor(list, 1650000)?.url).toBe('https://x/b.png');
    expect(officialQrFor(list, 2500037)).toBeNull();
    expect(officialQrFor(list, 1350000)).toBeNull();
  });
});

describe('enrolment link validity', () => {
  it('defaults to 14 days and accepts 7, 14 or 30', () => {
    expect(DEFAULT_ENROLMENT_LINK_DAYS).toBe(14);
    expect(parseEnrolmentLinkDays(undefined)).toBe(14);
    expect(parseEnrolmentLinkDays({ days: 30 })).toBe(30);
    expect(parseEnrolmentLinkDays({ days: 7 })).toBe(7);
  });
  it('clamps nonsense to the default', () => {
    expect(parseEnrolmentLinkDays({ days: 0 })).toBe(14);
    expect(parseEnrolmentLinkDays({ days: 400 })).toBe(14);
    expect(parseEnrolmentLinkDays({ days: 'x' })).toBe(14);
  });
});
