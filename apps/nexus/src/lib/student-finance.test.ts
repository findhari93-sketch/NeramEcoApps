import { describe, it, expect } from 'vitest';
import {
  CACHE_DRIFT_TOLERANCE_RUPEES,
  LEAD_PROFILE_FINANCE_COLUMNS,
  LEAD_PROFILE_KEY_COLUMNS,
  LEAD_PROFILE_PUBLIC_COLUMNS,
  STUDENT_PROFILE_FINANCE_COLUMNS,
  STUDENT_PROFILE_KEY_COLUMNS,
  STUDENT_PROFILE_PUBLIC_COLUMNS,
  computeFeeSummary,
  selectColumns,
  type PaymentRow,
} from './student-finance';

const paid = (amount: number): PaymentRow => ({ amount, status: 'paid' });

describe('the fee gate: column allowlists', () => {
  // These are the regression guards on the whole feature. If someone moves a
  // commercial column into the public list to fix a rendering bug, this fails
  // rather than the fee quietly appearing on every visiting teacher's screen.

  it('lead_profiles public and finance lists are disjoint', () => {
    const overlap = LEAD_PROFILE_PUBLIC_COLUMNS.filter((c) =>
      (LEAD_PROFILE_FINANCE_COLUMNS as readonly string[]).includes(c),
    );
    expect(overlap).toEqual([]);
  });

  it('student_profiles public and finance lists are disjoint', () => {
    const overlap = STUDENT_PROFILE_PUBLIC_COLUMNS.filter((c) =>
      (STUDENT_PROFILE_FINANCE_COLUMNS as readonly string[]).includes(c),
    );
    expect(overlap).toEqual([]);
  });

  it('key columns overlap neither list', () => {
    for (const key of LEAD_PROFILE_KEY_COLUMNS) {
      expect(LEAD_PROFILE_PUBLIC_COLUMNS as readonly string[]).not.toContain(key);
      expect(LEAD_PROFILE_FINANCE_COLUMNS as readonly string[]).not.toContain(key);
    }
    for (const key of STUDENT_PROFILE_KEY_COLUMNS) {
      expect(STUDENT_PROFILE_PUBLIC_COLUMNS as readonly string[]).not.toContain(key);
      expect(STUDENT_PROFILE_FINANCE_COLUMNS as readonly string[]).not.toContain(key);
    }
  });

  it('no list repeats a column', () => {
    for (const list of [
      LEAD_PROFILE_KEY_COLUMNS,
      LEAD_PROFILE_PUBLIC_COLUMNS,
      LEAD_PROFILE_FINANCE_COLUMNS,
      STUDENT_PROFILE_KEY_COLUMNS,
      STUDENT_PROFILE_PUBLIC_COLUMNS,
      STUDENT_PROFILE_FINANCE_COLUMNS,
    ]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('every column a teacher must never see is in the finance list', () => {
    // Named explicitly so the intent survives a refactor of the arrays.
    const mustBeGated = [
      'final_fee',
      'assigned_fee',
      'discount_amount',
      'full_payment_discount',
      'coupon_code',
      'payment_scheme',
      'payment_deadline',
      'installment_1_amount',
      'installment_2_amount',
      'allowed_payment_modes',
      'total_cashback_eligible',
      'caste_category',
      'utm_source',
      'referral_code',
    ];
    for (const column of mustBeGated) {
      expect(LEAD_PROFILE_FINANCE_COLUMNS as readonly string[]).toContain(column);
      expect(LEAD_PROFILE_PUBLIC_COLUMNS as readonly string[]).not.toContain(column);
    }

    for (const column of ['fee_paid', 'fee_due', 'total_fee', 'next_payment_date', 'payment_status']) {
      expect(STUDENT_PROFILE_FINANCE_COLUMNS as readonly string[]).toContain(column);
      expect(STUDENT_PROFILE_PUBLIC_COLUMNS as readonly string[]).not.toContain(column);
    }
  });

  it('the teaching data a profile page needs is still public', () => {
    for (const column of [
      'academic_data',
      'applicant_category',
      'application_number',
      'city',
      'father_name',
      'parent_phone',
      'target_exam_year',
    ]) {
      expect(LEAD_PROFILE_PUBLIC_COLUMNS as readonly string[]).toContain(column);
    }
  });

  it('selectColumns builds a PostgREST select from several lists', () => {
    const select = selectColumns(LEAD_PROFILE_KEY_COLUMNS, LEAD_PROFILE_PUBLIC_COLUMNS);
    expect(select).toContain('id, user_id');
    expect(select).toContain('academic_data');
    expect(select).not.toContain('final_fee');
  });
});

describe('computeFeeSummary: the canonical arithmetic', () => {
  it('matches the admin CRM: total from the application, paid from payments', () => {
    const s = computeFeeSummary({
      finalFee: 45000,
      payments: [paid(20000), paid(15000)],
    });
    expect(s.agreed).toBe(45000);
    expect(s.paid).toBe(35000);
    expect(s.balance).toBe(10000);
  });

  it('counts only payments that actually arrived', () => {
    const s = computeFeeSummary({
      finalFee: 50000,
      payments: [
        paid(20000),
        { amount: 10000, status: 'pending' },
        { amount: 5000, status: 'failed' },
        { amount: 8000, status: 'refunded' },
        { amount: 3000, status: null },
      ],
    });
    expect(s.paid).toBe(20000);
    expect(s.balance).toBe(30000);
  });

  it('clamps an overpayment to zero rather than showing a negative balance', () => {
    const s = computeFeeSummary({ finalFee: 30000, payments: [paid(35000)] });
    expect(s.paid).toBe(35000);
    expect(s.balance).toBe(0);
  });

  it('keeps agreed and balance null when there is no fee agreement', () => {
    // A staff-added student has no lead_profiles row. Rendering 0 here would
    // show a fake settled balance, which is worse than showing nothing.
    const s = computeFeeSummary({ finalFee: null, payments: [paid(5000)] });
    expect(s.agreed).toBeNull();
    expect(s.balance).toBeNull();
    expect(s.paid).toBe(5000);
  });

  it('reports zero paid, not null, when nobody has paid anything', () => {
    // Nothing paid is a measured fact, unlike a missing agreement.
    const s = computeFeeSummary({ finalFee: 45000, payments: [] });
    expect(s.paid).toBe(0);
    expect(s.balance).toBe(45000);
  });

  it('survives malformed amounts without producing NaN', () => {
    const s = computeFeeSummary({
      finalFee: 10000,
      payments: [paid(4000), { amount: null, status: 'paid' }],
    });
    expect(s.paid).toBe(4000);
    expect(Number.isNaN(s.paid)).toBe(false);
  });
});

describe('computeFeeSummary: the next-due fallback chain', () => {
  it('prefers the date a human set on the student profile', () => {
    const s = computeFeeSummary({
      finalFee: 1,
      payments: [],
      nextPaymentDate: '2026-09-01',
      paymentDeadline: '2026-08-01',
      enrollmentDate: '2026-01-01',
      installment2DueDays: 90,
    });
    expect(s.nextDue).toEqual({ date: '2026-09-01', source: 'student_profile' });
  });

  it('falls back to the application deadline', () => {
    const s = computeFeeSummary({
      finalFee: 1,
      payments: [],
      paymentDeadline: '2026-08-01',
      enrollmentDate: '2026-01-01',
      installment2DueDays: 90,
    });
    expect(s.nextDue).toEqual({ date: '2026-08-01', source: 'application_deadline' });
  });

  it('derives from the enrolment date and the instalment window last', () => {
    const s = computeFeeSummary({
      finalFee: 1,
      payments: [],
      enrollmentDate: '2026-01-01T00:00:00Z',
      installment2DueDays: 60,
    });
    expect(s.nextDue.source).toBe('derived_installment');
    expect(s.nextDue.date).toBe('2026-03-02');
  });

  it('reports no date rather than guessing when nothing is available', () => {
    const s = computeFeeSummary({ finalFee: 1, payments: [] });
    expect(s.nextDue).toEqual({ date: null, source: null });
  });

  it('does not derive from an unparseable enrolment date', () => {
    const s = computeFeeSummary({
      finalFee: 1,
      payments: [],
      enrollmentDate: 'not a date',
      installment2DueDays: 30,
    });
    expect(s.nextDue.date).toBeNull();
  });
});

describe('computeFeeSummary: cache drift detection', () => {
  it('is silent when the cache agrees with the truth', () => {
    const s = computeFeeSummary({
      finalFee: 45000,
      payments: [paid(20000)],
      cache: { fee_paid: 20000, fee_due: 25000 },
    });
    expect(s.cacheDisagreement).toBeNull();
  });

  it('flags a stale fee_paid and names the field', () => {
    const s = computeFeeSummary({
      finalFee: 45000,
      payments: [paid(20000)],
      cache: { fee_paid: 5000, fee_due: 25000 },
    });
    expect(s.cacheDisagreement).toEqual({ fields: ['fee_paid'], deltaRupees: 15000 });
  });

  it('flags both fields when both drifted', () => {
    const s = computeFeeSummary({
      finalFee: 45000,
      payments: [paid(20000)],
      cache: { fee_paid: 0, fee_due: 45000 },
    });
    expect(s.cacheDisagreement?.fields).toEqual(['fee_paid', 'fee_due']);
  });

  it('tolerates rounding noise', () => {
    const s = computeFeeSummary({
      finalFee: 45000,
      payments: [paid(20000)],
      cache: { fee_paid: 20000 + CACHE_DRIFT_TOLERANCE_RUPEES, fee_due: 25000 },
    });
    expect(s.cacheDisagreement).toBeNull();
  });

  it('does not compare fee_due when there is no agreement to compare against', () => {
    const s = computeFeeSummary({
      finalFee: null,
      payments: [paid(5000)],
      cache: { fee_paid: 5000, fee_due: 99999 },
    });
    expect(s.cacheDisagreement).toBeNull();
  });

  it('is silent when there is no cache row at all', () => {
    const s = computeFeeSummary({ finalFee: 45000, payments: [paid(1)], cache: null });
    expect(s.cacheDisagreement).toBeNull();
  });
});
