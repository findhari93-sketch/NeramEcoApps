// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeDb, type FakeDb } from './test-fake-db';

/**
 * Fulfilment turns a succeeded attempt into money on the ledger and (for an
 * enrolment) a student. Pinned: it reuses the existing writers with the exact
 * money shape the Admin verify route used, it is safe to run twice, and the
 * ledger row is stamped with the attempt that paid it.
 */
const finaliseDirectEnrolment = vi.fn();
const recordOfficePayment = vi.fn();
vi.mock('../direct-enrolment', () => ({ finaliseDirectEnrolment: (...a: unknown[]) => finaliseDirectEnrolment(...a) }));
vi.mock('../../queries/office-fees', () => ({ recordOfficePayment: (...a: unknown[]) => recordOfficePayment(...a) }));

import { fulfilIntent } from './fulfil';

const link = (over: any = {}) => ({
  id: 'link-1',
  status: 'payment_submitted',
  payment_mode: 'student_pays',
  total_fee: 30000,
  discount_amount: 0,
  offer_full_amount: 25000,
  offer_installment_1: 16500,
  offer_installment_2: 13500,
  offer_balance_due_days: 45,
  installment_2_due_date: null,
  submitted_form: { firstName: 'Radhika', applicantCategory: 'drop_year' },
  interest_course: 'nata',
  ...over,
});
const intent = (over: any = {}) => ({ id: 'int-1', purpose: 'enrolment', enrollment_link_id: 'link-1', user_id: 'user-1', scheme: 'full', amount_paise: 2500000, status: 'paid', ...over });
const attempt = (over: any = {}) => ({
  id: 'att-1',
  intent_id: 'int-1',
  method: 'upi_proof',
  state: 'succeeded',
  amount_paise: 2500000,
  paise_tag: null,
  convenience_fee_paise: 0,
  utr: '123456789012',
  paid_on_claimed: '2026-10-20',
  proof_object_path: 'attempts/int-1/abc.jpg',
  review_by: 'staff-1',
  ...over,
});

let db: FakeDb;
beforeEach(() => {
  finaliseDirectEnrolment.mockReset();
  recordOfficePayment.mockReset();
  finaliseDirectEnrolment.mockResolvedValue({ ok: true, applicationNumber: 'APP-77', studentProfileId: 'sp-1', leadProfileId: 'lead-1', paymentKey: 'direct-link:link-1' });
  recordOfficePayment.mockResolvedValue({ payment: { id: 'pay-2', amount: 13500, created: true }, view: { balance: 0 }, warnings: [] });
  db = fakeDb({
    payment_attempts: [attempt()],
    payment_intents: [intent()],
    direct_enrollment_links: [link()],
    payments: [{ id: 'pay-1', idempotency_key: 'direct-link:link-1', attempt_id: null }],
  });
});

describe('fulfilIntent: enrolment', () => {
  it('enrols through finaliseDirectEnrolment with the pay-in-full money shape', async () => {
    const res = await fulfilIntent(db.client, 'att-1');
    expect(res).toMatchObject({ ok: true, applicationNumber: 'APP-77' });
    expect(finaliseDirectEnrolment).toHaveBeenCalledTimes(1);
    const [, input] = finaliseDirectEnrolment.mock.calls[0];
    expect(input.userId).toBe('user-1');
    expect(input.form).toEqual({ firstName: 'Radhika', applicantCategory: 'drop_year' });
    expect(input.verifiedBy).toBe('staff-1');
    expect(input.link).toMatchObject({
      payment_scheme: 'full',
      total_fee: 30000,
      discount_amount: 5000,
      final_fee: 25000,
      amount_paid: 25000,
      installment_2_amount: null,
      payment_method: 'upi_direct',
      transaction_reference: '123456789012',
      payment_date: '2026-10-20',
    });
    expect(input.payment).toMatchObject({ method: 'upi_direct', date: '2026-10-20', reference: '123456789012', utr: '123456789012', proofUrl: 'attempts/int-1/abc.jpg' });
    // The link row carries the same money, as the Admin verify route wrote it.
    expect(db.rows('direct_enrollment_links')[0]).toMatchObject({ payment_scheme: 'full', amount_paid: 25000, final_fee: 25000, transaction_reference: '123456789012' });
  });

  it('uses the installment money shape with the balance and its due date', async () => {
    db.rows('payment_intents')[0].scheme = 'installment';
    db.rows('payment_intents')[0].amount_paise = 1650000;
    db.rows('payment_attempts')[0].amount_paise = 1650000;
    const res = await fulfilIntent(db.client, 'att-1');
    expect(res.ok).toBe(true);
    const [, input] = finaliseDirectEnrolment.mock.calls[0];
    expect(input.link).toMatchObject({
      payment_scheme: 'installment',
      total_fee: 30000,
      discount_amount: 0,
      final_fee: 30000,
      amount_paid: 16500,
      installment_2_amount: 13500,
      installment_2_due_date: '2026-12-04',
    });
  });

  it('strips the paise tag off an instant UPI order and enrols with no staff verifier', async () => {
    Object.assign(db.rows('payment_attempts')[0], { method: 'upi_auto', amount_paise: 2500037, paise_tag: 37, review_by: null, proof_object_path: null, paid_on_claimed: null });
    const res = await fulfilIntent(db.client, 'att-1');
    expect(res.ok).toBe(true);
    const [, input] = finaliseDirectEnrolment.mock.calls[0];
    expect(input.link.amount_paid).toBe(25000);
    expect(input.link.payment_method).toBe('upi_direct');
    expect(input.verifiedBy).toBeNull();
    expect(input.payment.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('stamps the ledger row with the attempt that paid it', async () => {
    await fulfilIntent(db.client, 'att-1');
    expect(db.rows('payments').find((p) => p.idempotency_key === 'direct-link:link-1')?.attempt_id).toBe('att-1');
  });

  it('is safe to run again once the link is used', async () => {
    db.rows('direct_enrollment_links')[0].status = 'used';
    const res = await fulfilIntent(db.client, 'att-1');
    expect(res.ok).toBe(true);
    expect(finaliseDirectEnrolment).not.toHaveBeenCalled();
    expect(db.rows('payments')[0].attempt_id).toBe('att-1');
  });

  it('cannot enrol without the student details and says it is not worth retrying', async () => {
    db.rows('direct_enrollment_links')[0].submitted_form = null;
    const res = await fulfilIntent(db.client, 'att-1');
    expect(res).toMatchObject({ ok: false, retryable: false });
    expect(finaliseDirectEnrolment).not.toHaveBeenCalled();
  });

  it('passes a finalise failure up, retryable only for server faults', async () => {
    finaliseDirectEnrolment.mockResolvedValueOnce({ ok: false, status: 500, error: 'Failed to create student profile.' });
    expect(await fulfilIntent(db.client, 'att-1')).toMatchObject({ ok: false, retryable: true, error: 'Failed to create student profile.' });
    finaliseDirectEnrolment.mockResolvedValueOnce({ ok: false, status: 400, error: 'You are already enrolled as a student' });
    expect(await fulfilIntent(db.client, 'att-1')).toMatchObject({ ok: false, retryable: false });
  });
});

describe('fulfilIntent: installment', () => {
  beforeEach(() => {
    db = fakeDb({
      payment_attempts: [attempt({ id: 'att-2', intent_id: 'int-2', method: 'bank_proof', amount_paise: 1350000, utr: 'KKBKH26291123456', review_by: 'staff-1' })],
      payment_intents: [intent({ id: 'int-2', purpose: 'installment', enrollment_link_id: null, installment_id: 'inst-2', scheme: 'installment', amount_paise: 1350000, metadata: { installment_number: 2 } })],
      payments: [],
    });
  });

  it('records the balance through recordOfficePayment under the attempt key', async () => {
    db.rows('payments').push({ id: 'pay-2', idempotency_key: 'attempt:att-2', attempt_id: null });
    const res = await fulfilIntent(db.client, 'att-2');
    expect(res).toMatchObject({ ok: true, paymentKey: 'attempt:att-2' });
    expect(recordOfficePayment).toHaveBeenCalledTimes(1);
    const [opts] = recordOfficePayment.mock.calls[0];
    expect(opts).toMatchObject({
      userId: 'user-1',
      adminId: 'staff-1',
      line: { key: 'attempt:att-2', amount: 13500, paidOn: '2026-10-20', method: 'bank_transfer', reference: 'KKBKH26291123456', installmentNumber: 2 },
    });
    expect(db.rows('payments')[0]).toMatchObject({ attempt_id: 'att-2', direct_payment_utr: 'KKBKH26291123456', screenshot_verified: true });
  });

  it('records an auto-confirmed balance with no admin', async () => {
    Object.assign(db.rows('payment_attempts')[0], { method: 'upi_auto', amount_paise: 1350021, paise_tag: 21, review_by: null });
    await fulfilIntent(db.client, 'att-2');
    const [opts] = recordOfficePayment.mock.calls[0];
    expect(opts.adminId).toBeNull();
    expect(opts.line.amount).toBe(13500);
    expect(opts.line.method).toBe('upi_direct');
  });

  it('only stamps the legacy ledger row for a claim staff already verified, never records twice', async () => {
    // Phase 0: Admin verify already ran recordOfficePayment under fee-claim:<id>; the bridged attempt remembers the claim.
    db.rows('payment_attempts')[0].metadata = { claim_id: 'claim-9', legacy: true };
    db.rows('payments').push({ id: 'pay-9', idempotency_key: 'fee-claim:claim-9', attempt_id: null });
    const res = await fulfilIntent(db.client, 'att-2');
    expect(res).toMatchObject({ ok: true, paymentKey: 'fee-claim:claim-9' });
    expect(recordOfficePayment).not.toHaveBeenCalled();
    expect(db.rows('payments').find((p) => p.id === 'pay-9')?.attempt_id).toBe('att-2');
  });

  it('treats a fee-plan rule failure as not retryable', async () => {
    const err: any = new Error('Set the fee for this student first.');
    err.name = 'StudentFeeError';
    recordOfficePayment.mockRejectedValueOnce(err);
    expect(await fulfilIntent(db.client, 'att-2')).toMatchObject({ ok: false, retryable: false });
    recordOfficePayment.mockRejectedValueOnce(new Error('connection reset'));
    expect(await fulfilIntent(db.client, 'att-2')).toMatchObject({ ok: false, retryable: true });
  });
});
