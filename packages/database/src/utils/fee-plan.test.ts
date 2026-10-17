import { describe, it, expect } from 'vitest';
import {
  istToday,
  daysUntil,
  addDaysToKey,
  isDateKey,
  pickFeeLead,
  isStaffUnreviewedManualRow,
  effectiveAgreedFee,
  allocatePayments,
  buildFeeView,
  feeSignature,
  buildCollections,
  collectionStatus,
  planFeeReminders,
  reminderCandidatesFromView,
  validatePlan,
  validateCorrection,
  type FeeLeadRow,
  type InstallmentRow,
  type FeePaymentRow,
} from './fee-plan';

/**
 * These decide which student is told they owe money, and when. A day early, a
 * rupee wrong or a reminder sent twice is a real message to a real family, so the
 * date edges and the dedupe keys are pinned here.
 */

// 16 Oct 2026, 10:00 IST
const NOW = new Date('2026-10-16T04:30:00Z');

describe('IST dates', () => {
  it('uses the India date, not the UTC one, around midnight', () => {
    // 18:29 UTC on the 15th is 23:59 IST on the 15th; 18:31 UTC is 00:01 IST on the 16th.
    expect(istToday(new Date('2026-10-15T18:29:00Z'))).toBe('2026-10-15');
    expect(istToday(new Date('2026-10-15T18:31:00Z'))).toBe('2026-10-16');
  });

  it('counts whole days to a due date', () => {
    expect(daysUntil('2026-10-16', NOW)).toBe(0);
    expect(daysUntil('2026-10-19', NOW)).toBe(3);
    expect(daysUntil('2026-10-10', NOW)).toBe(-6);
    expect(addDaysToKey('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('rejects dates that do not exist', () => {
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('16/10/2026')).toBe(false);
    expect(isDateKey('2026-10-16')).toBe(true);
  });
});

describe('pickFeeLead', () => {
  const profilePage: FeeLeadRow = { id: 'pp', source: 'manual', applicant_category: 'school_student', created_at: '2026-10-06T00:00:00Z' };
  const website: FeeLeadRow = { id: 'web', source: 'website_form', application_number: 'NA-1', created_at: '2026-09-01T00:00:00Z' };

  it('prefers the row that already holds a fee, even if older', () => {
    const withFee = { ...website, final_fee: '30000.00' };
    expect(pickFeeLead([profilePage, withFee])!.id).toBe('web');
  });

  it('prefers a real application over the student profile page row', () => {
    expect(pickFeeLead([profilePage, website])!.id).toBe('web');
  });

  it('falls back to the newest row, and to null with none', () => {
    expect(pickFeeLead([profilePage])!.id).toBe('pp');
    expect(pickFeeLead([])).toBeNull();
  });

  it('recognises the profile page row the same way Nexus does', () => {
    expect(isStaffUnreviewedManualRow(profilePage)).toBe(true);
    expect(isStaffUnreviewedManualRow({ ...profilePage, reviewed_by: 'staff' })).toBe(false);
    expect(isStaffUnreviewedManualRow({ ...profilePage, application_number: 'NA-2' })).toBe(false);
  });
});

describe('effectiveAgreedFee', () => {
  it('is the final fee for an installment plan', () => {
    expect(effectiveAgreedFee({ id: 'l', final_fee: 30000, payment_scheme: 'installment', full_payment_discount: 5000 })).toBe(30000);
  });

  it('takes off the pay-in-full discount for a full payer, as checkout did', () => {
    expect(
      effectiveAgreedFee({ id: 'l', final_fee: 30000, payment_scheme: 'full', allowed_payment_modes: 'full_and_installment', full_payment_discount: 5000 }),
    ).toBe(25000);
  });

  it('does not take it off when the student could only pay in full', () => {
    expect(
      effectiveAgreedFee({ id: 'l', final_fee: 30000, payment_scheme: 'full', allowed_payment_modes: 'full_only', full_payment_discount: 5000 }),
    ).toBe(30000);
  });

  it('is null, never 0, with no fee', () => {
    expect(effectiveAgreedFee({ id: 'l' })).toBeNull();
    expect(effectiveAgreedFee(null)).toBeNull();
  });
});

const inst = (n: number, amount: number, due: string, extra: Partial<InstallmentRow> = {}): InstallmentRow => ({
  id: `i${n}`, lead_profile_id: 'l1', installment_number: n, amount, due_date: due, status: 'pending', ...extra,
});
const pay = (id: string, amount: number, paidAt: string, extra: Partial<FeePaymentRow> = {}): FeePaymentRow => ({
  id, amount, paid_at: paidAt, status: 'paid', ...extra,
});

describe('allocatePayments', () => {
  it('applies untagged payments oldest first, lowest installment first', () => {
    const a = allocatePayments(
      [inst(1, 15000, '2026-09-01'), inst(2, 15000, '2026-11-01')],
      [pay('p1', 15000, '2026-09-01T00:00:00+05:30')],
    );
    expect(a.get('i1')!.settled).toBe(true);
    expect(a.get('i1')!.paidOn).toBe('2026-09-01');
    expect(a.get('i2')!.settled).toBe(false);
  });

  it('sends a tagged payment to its own installment', () => {
    const a = allocatePayments(
      [inst(1, 15000, '2026-09-01'), inst(2, 15000, '2026-11-01')],
      [pay('p2', 15000, '2026-10-01T00:00:00+05:30', { installment_number: 2 })],
    );
    expect(a.get('i2')!.settled).toBe(true);
    expect(a.get('i1')!.settled).toBe(false);
  });

  it('spills an overpayment into the next installment', () => {
    const a = allocatePayments(
      [inst(1, 10000, '2026-09-01'), inst(2, 20000, '2026-11-01')],
      [pay('p1', 15000, '2026-09-01T00:00:00+05:30')],
    );
    expect(a.get('i2')!.paidAmount).toBe(5000);
  });

  it('lets the unscheduled part of the fee take the first money', () => {
    // Only installment 2 is on the schedule: the first 15000 is installment 1.
    const a = allocatePayments([inst(2, 15000, '2026-11-01')], [pay('p1', 15000, '2026-09-01')], { unscheduledFirst: 15000 });
    expect(a.get('i2')!.settled).toBe(false);
    expect(a.get('i2')!.paidAmount).toBe(0);
  });

  it('gives a waived installment nothing and treats it as closed', () => {
    const a = allocatePayments([inst(2, 15000, '2026-11-01', { status: 'waived' })], [pay('p1', 15000, '2026-09-01')]);
    expect(a.get('i2')!.paidAmount).toBe(0);
    expect(a.get('i2')!.settled).toBe(true);
  });

  it('ignores payments that did not go through', () => {
    const a = allocatePayments([inst(1, 15000, '2026-09-01')], [pay('p1', 15000, '2026-09-01', { status: 'failed' })]);
    expect(a.get('i1')!.settled).toBe(false);
  });
});

const LEAD: FeeLeadRow = { id: 'l1', user_id: 'u1', assigned_fee: 35000, discount_amount: 5000, final_fee: 30000, payment_scheme: 'installment' };

describe('buildFeeView', () => {
  it('shows the second installment as what is next', () => {
    const view = buildFeeView({
      lead: LEAD,
      payments: [pay('p1', 15000, '2026-09-01T00:00:00+05:30', { payment_method: 'upi_direct' })],
      installments: [inst(1, 15000, '2026-09-01'), inst(2, 15000, '2026-10-19')],
    });
    expect(view.agreed).toBe(30000);
    expect(view.paidTotal).toBe(15000);
    expect(view.balance).toBe(15000);
    expect(view.plan).toBe('installment');
    expect(view.nextDue).toEqual({ installmentId: 'i2', number: 2, amount: 15000, dueDate: '2026-10-19' });
    expect(view.payments[0].methodLabel).toBe('Google Pay or UPI');
  });

  it('shows a balance with no date when nobody set one', () => {
    const view = buildFeeView({ lead: { ...LEAD, payment_scheme: 'full' }, payments: [pay('p1', 20000, '2026-09-01')], installments: [] });
    expect(view.nextDue).toEqual({ installmentId: null, number: null, amount: 10000, dueDate: null });
  });

  it('has nothing next once paid in full', () => {
    const view = buildFeeView({ lead: LEAD, payments: [pay('p1', 30000, '2026-09-01')], installments: [] });
    expect(view.nextDue).toBeNull();
  });

  it('changes its signature when the fee or the payments change', () => {
    const base = { lead: LEAD, payments: [pay('p1', 15000, '2026-09-01')], installments: [inst(2, 15000, '2026-10-19')] };
    const a = feeSignature(buildFeeView(base));
    expect(feeSignature(buildFeeView(base))).toBe(a);
    expect(feeSignature(buildFeeView({ ...base, installments: [inst(2, 15000, '2026-10-25')] }))).not.toBe(a);
    expect(feeSignature(buildFeeView({ ...base, payments: [...base.payments, pay('p2', 1000, '2026-10-01')] }))).not.toBe(a);
  });
});

describe('collectionStatus', () => {
  const view = (due: string | null, balance = 15000) =>
    buildFeeView({
      lead: LEAD,
      payments: [pay('p1', 30000 - balance, '2026-09-01')],
      installments: due ? [inst(2, 15000, due)] : [],
    });

  it('reads due today, soon, later and overdue from the IST date', () => {
    expect(collectionStatus(view('2026-10-16'), NOW)).toEqual({ status: 'due_today', days: 0 });
    expect(collectionStatus(view('2026-10-19'), NOW).status).toBe('due_soon');
    expect(collectionStatus(view('2026-11-30'), NOW).status).toBe('due_later');
    expect(collectionStatus(view('2026-10-11'), NOW)).toEqual({ status: 'overdue', days: -5 });
    expect(collectionStatus(view(null), NOW).status).toBe('no_date');
  });

  it('calls a student with no fee missing, not paid', () => {
    const v = buildFeeView({ lead: { id: 'l1' }, payments: [], installments: [] });
    expect(collectionStatus(v, NOW).status).toBe('missing_fee');
  });
});

describe('buildCollections', () => {
  it('totals a year and lists who owes', () => {
    const res = buildCollections(
      {
        students: [
          { userId: 'u1', name: 'Owes later', academicYear: '2026-27' },
          { userId: 'u2', name: 'Overdue', academicYear: '2026-27' },
          { userId: 'u3', name: 'Paid', academicYear: '2026-27' },
          { userId: 'u4', name: 'No fee', academicYear: '2026-27' },
        ],
        leads: [
          { ...LEAD, id: 'l1', user_id: 'u1' },
          { ...LEAD, id: 'l2', user_id: 'u2' },
          { ...LEAD, id: 'l3', user_id: 'u3' },
        ],
        payments: [
          pay('p1', 15000, '2026-09-01', { user_id: 'u1' }),
          pay('p2', 15000, '2026-09-01', { user_id: 'u2' }),
          pay('p3', 30000, '2026-09-01', { user_id: 'u3' }),
        ],
        installments: [
          { ...inst(2, 15000, '2026-12-01'), id: 'a', lead_profile_id: 'l1' },
          { ...inst(2, 15000, '2026-10-01'), id: 'b', lead_profile_id: 'l2' },
        ],
        openReports: [{ id: 'r1', user_id: 'u2' }],
      },
      NOW,
    );
    expect(res.totals).toMatchObject({
      students: 4,
      agreed: 90000,
      collected: 60000,
      toCollect: 30000,
      overdueCount: 1,
      overdueAmount: 15000,
      missingFeeCount: 1,
      openReports: 1,
    });
    const byName = Object.fromEntries(res.rows.map((r) => [r.name, r]));
    expect(byName['Overdue'].status).toBe('overdue');
    expect(byName['Overdue'].openReportId).toBe('r1');
    expect(byName['Paid'].status).toBe('paid');
    expect(byName['No fee'].status).toBe('missing_fee');
    expect(byName['Owes later'].status).toBe('due_later');
  });
});

describe('planFeeReminders', () => {
  const cand = (due: string, extra = {}) => ({
    installmentId: 'i2', userId: 'u1', number: 2, amount: 15000, dueDate: due, settled: false, ...extra,
  });

  it('reminds 3 days before, with the same key on each of those days', () => {
    const d3 = planFeeReminders([cand('2026-10-19')], 'student', NOW);
    const d1 = planFeeReminders([cand('2026-10-17')], 'student', NOW);
    expect(d3[0].kind).toBe('upcoming');
    expect(d3[0].dedupeKey).toBe('student:upcoming:i2:2026-10-19');
    expect(d1[0].kind).toBe('upcoming');
    expect(planFeeReminders([cand('2026-10-20')], 'student', NOW)).toEqual([]);
  });

  it('reminds on the day', () => {
    expect(planFeeReminders([cand('2026-10-16')], 'staff', NOW)[0].kind).toBe('due_today');
  });

  it('tells staff once when overdue, then weekly; never chases the student', () => {
    expect(planFeeReminders([cand('2026-10-13')], 'staff', NOW)[0]).toMatchObject({ kind: 'overdue', dedupeKey: 'staff:overdue:i2:2026-10-13' });
    expect(planFeeReminders([cand('2026-10-02')], 'staff', NOW)[0]).toMatchObject({ kind: 'overdue_weekly', dedupeKey: 'staff:overdue_weekly:i2:2026-10-02:w2' });
    expect(planFeeReminders([cand('2026-10-13')], 'student', NOW)).toEqual([]);
  });

  it('re-arms when the due date moves', () => {
    const a = planFeeReminders([cand('2026-10-18')], 'staff', NOW)[0].dedupeKey;
    const b = planFeeReminders([cand('2026-10-19')], 'staff', NOW)[0].dedupeKey;
    expect(a).not.toBe(b);
  });

  it('skips paid, waived and alumni, and pauses the student while they say they paid', () => {
    expect(planFeeReminders([cand('2026-10-16', { settled: true })], 'staff', NOW)).toEqual([]);
    expect(planFeeReminders([cand('2026-10-16', { waived: true })], 'staff', NOW)).toEqual([]);
    expect(planFeeReminders([cand('2026-10-16', { isAlumni: true })], 'staff', NOW)).toEqual([]);
    expect(planFeeReminders([cand('2026-10-16', { hasOpenReport: true })], 'student', NOW)).toEqual([]);
    expect(planFeeReminders([cand('2026-10-16', { hasOpenReport: true })], 'staff', NOW)).toHaveLength(1);
  });

  it('builds candidates only for what is still owed', () => {
    const view = buildFeeView({
      lead: LEAD,
      payments: [pay('p1', 15000, '2026-09-01')],
      installments: [inst(1, 15000, '2026-09-01'), inst(2, 15000, '2026-10-19')],
    });
    const c = reminderCandidatesFromView('u1', view);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ installmentId: 'i2', amount: 15000, dueDate: '2026-10-19' });
  });
});

describe('validatePlan', () => {
  const today = '2026-10-16';
  const line = (over = {}) => ({ key: 'k1', amount: 15000, paidOn: '2026-09-01', method: 'upi_direct', ...over });

  it('accepts a two-installment plan that adds up', () => {
    const res = validatePlan(
      { assignedFee: 35000, discount: 5000, scheme: 'installment', installment1Amount: 15000, installment2Amount: 15000, installment2DueDate: '2026-11-15' },
      [line()],
      { today },
    );
    expect(res.errors).toEqual([]);
    expect(res.finalFee).toBe(30000);
  });

  it('refuses installments that do not add up, and a missing due date', () => {
    const res = validatePlan({ assignedFee: 30000, scheme: 'installment', installment1Amount: 15000, installment2Amount: 10000 }, [], { today });
    const fields = res.errors.map((e) => e.field);
    expect(fields).toContain('installment2Amount');
    expect(fields).toContain('installment2DueDate');
  });

  it('refuses a due date before the first payment, and warns on one already past', () => {
    const before = validatePlan(
      { assignedFee: 30000, scheme: 'installment', installment1Amount: 15000, installment2Amount: 15000, installment2DueDate: '2026-08-01' },
      [line()],
      { today },
    );
    expect(before.errors.some((e) => e.field === 'installment2DueDate')).toBe(true);
    const past = validatePlan(
      { assignedFee: 30000, scheme: 'installment', installment1Amount: 15000, installment2Amount: 15000, installment2DueDate: '2026-10-01' },
      [line()],
      { today },
    );
    expect(past.errors).toEqual([]);
    expect(past.warnings.some((w) => w.includes('already passed'))).toBe(true);
  });

  it('refuses a payment in the future, without an amount, or without a method', () => {
    const res = validatePlan({ assignedFee: 30000, scheme: 'full' }, [line({ paidOn: '2026-10-20' }), line({ key: 'k2', amount: 0, method: 'cheque' })], { today });
    const fields = res.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['payments.0.paidOn', 'payments.1.amount', 'payments.1.method']));
  });

  it('warns about a line that looks like money already recorded, and an overpayment', () => {
    const res = validatePlan({ assignedFee: 20000, scheme: 'full' }, [line()], {
      today, alreadyPaid: 15000, existing: [{ amount: 15000, paidOn: '2026-09-01' }],
    });
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => w.includes('already recorded'))).toBe(true);
    expect(res.warnings.some((w) => w.includes('more than the fee'))).toBe(true);
  });

  it('needs a total fee', () => {
    expect(validatePlan({ assignedFee: null, scheme: 'full' }, [], { today }).errors[0].field).toBe('assignedFee');
  });
});

describe('validateCorrection', () => {
  it('needs a note, and accepts no payment rows', () => {
    expect(validateCorrection({ note: '  ' }).ok).toBe(false);
    const ok = validateCorrection({ note: 'My discount was 5000', items: [] }, '2026-10-16');
    expect(ok).toEqual({ ok: true, items: [], note: 'My discount was 5000' });
  });

  it('checks each payment row', () => {
    expect(validateCorrection({ note: 'x', items: [{ amount: 0, paidOn: '2026-10-01', method: 'cash' }] }, '2026-10-16').ok).toBe(false);
    expect(validateCorrection({ note: 'x', items: [{ amount: 100, paidOn: '2026-10-30', method: 'cash' }] }, '2026-10-16').ok).toBe(false);
    expect(validateCorrection({ note: 'x', items: [{ amount: 100, paidOn: '2026-10-01', method: 'cheque' }] }, '2026-10-16').ok).toBe(false);
    const ok = validateCorrection({ note: 'x', items: [{ amount: '15,000', paidOn: '2026-10-01', method: 'upi_direct', reference: ' UTR1 ' }] }, '2026-10-16');
    expect(ok).toEqual({ ok: true, note: 'x', items: [{ amount: 15000, paidOn: '2026-10-01', method: 'upi_direct', reference: 'UTR1' }] });
  });
});
