import { describe, it, expect } from 'vitest';
import { COURSE_FEES, feeById, feesPromptText, formatRupees, fullPaymentSaving } from './fees';

describe('Aintra fees', () => {
  it('formats rupees with Indian grouping', () => {
    expect(formatRupees(25000)).toBe('₹25,000');
    expect(formatRupees(150000)).toBe('₹1,50,000');
  });

  it('computes the saving for paying in full, and none for a single-payment course', () => {
    expect(fullPaymentSaving(feeById('1-year')!)).toBe(5000);
    expect(fullPaymentSaving(feeById('2-year')!)).toBe(5000);
    expect(fullPaymentSaving(feeById('crash')!)).toBeNull();
  });

  it('puts every number the cards show into the prompt, so the two never disagree', () => {
    const prompt = feesPromptText();
    for (const fee of COURSE_FEES) {
      expect(prompt).toContain(fee.name);
      expect(prompt).toContain(`(id ${fee.id})`);
      expect(prompt).toContain(formatRupees(fee.fullPrice));
      if (fee.installmentTotal != null) expect(prompt).toContain(formatRupees(fee.installmentTotal));
    }
  });

  it('writes no table and no em dash into the prompt (the model copies both)', () => {
    const prompt = feesPromptText();
    expect(prompt).not.toContain('|');
    expect(prompt).not.toContain('—');
  });
});
