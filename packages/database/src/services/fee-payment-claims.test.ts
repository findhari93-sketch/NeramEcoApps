// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pay balance claims. Pinned: the amount is the fee plan's next due (never the
 * browser's), one claim waits at a time, a UTR backs one payment, and staff
 * verification records the money exactly once.
 */

let feeState: any;
const recordOfficePayment = vi.fn();
vi.mock('../queries/office-fees', () => ({
  loadStudentFeeState: async () => feeState,
  recordOfficePayment: (...a: unknown[]) => recordOfficePayment(...a),
}));

import { submitFeePaymentClaim, verifyFeePaymentClaim, rejectFeePaymentClaim, loadBalanceDue } from './fee-payment-claims';

type Result = { data: any; error: any };
let pendingClaim: any = null;
let utrHits: Record<string, any> = {};
let inserted: any[] = [];
let lockResult: Result = { data: null, error: null };
const updates: { table: string; payload: any }[] = [];

function chain(table: string) {
  let op: 'select' | 'insert' | 'update' = 'select';
  let payload: any = null;
  const filters: any[] = [];
  const api: any = {
    select: () => api,
    insert: (p: any) => {
      op = 'insert';
      payload = p;
      return api;
    },
    update: (p: any) => {
      op = 'update';
      payload = p;
      updates.push({ table, payload: p });
      return api;
    },
    eq: (...a: any[]) => (filters.push(a), api),
    neq: () => api,
    in: () => api,
    is: () => api,
    limit: () => api,
    maybeSingle: async (): Promise<Result> => {
      if (op === 'update' && table === 'fee_payment_claims') return lockResult;
      if (table === 'fee_payment_claims' && filters.some(([c]) => c === 'status')) {
        const byUtr = filters.find(([c]) => c === 'utr');
        if (byUtr) return { data: utrHits.claims ?? null, error: null };
        return { data: pendingClaim, error: null };
      }
      if (table === 'direct_enrollment_links') return { data: utrHits.links ?? null, error: null };
      if (table === 'payments') return { data: utrHits.payments ?? null, error: null };
      return { data: null, error: null };
    },
    single: async (): Promise<Result> => {
      if (op === 'insert') {
        inserted.push(payload);
        return { data: { id: 'claim-1', ...payload }, error: null };
      }
      return { data: { id: 'claim-1', status: 'verified' }, error: null };
    },
    then: (resolve: (v: Result) => void) => resolve({ data: null, error: null }),
  };
  return api;
}
const supabase = { from: (t: string) => chain(t) };

const yesterday = new Date(Date.now() + 5.5 * 3600000 - 86400000).toISOString().slice(0, 10);
const goodInput = {
  userId: 'user-1',
  method: 'upi_direct',
  transactionReference: '4123 4567 8901',
  paymentDate: yesterday,
  paymentProofUrl: 'https://x/storage/v1/object/public/payment-proofs/u/b/1.jpg',
};

beforeEach(() => {
  feeState = {
    user: { id: 'user-1', name: 'Radhika', user_type: 'student' },
    lead: { id: 'lead-1', first_name: 'Radhika' },
    view: {
      agreed: 30000,
      paidTotal: 16500,
      balance: 13500,
      nextDue: { installmentId: 'inst-2', number: 2, amount: 13500, dueDate: '2026-12-03' },
    },
  };
  pendingClaim = null;
  utrHits = {};
  inserted = [];
  lockResult = { data: null, error: null };
  updates.length = 0;
  recordOfficePayment.mockReset();
});

describe('loadBalanceDue', () => {
  it('reads the next installment off the fee plan', async () => {
    const due = await loadBalanceDue(supabase, 'user-1');
    expect(due).toMatchObject({ amount: 13500, installmentNumber: 2, dueDate: '2026-12-03', balance: 13500, isStudent: true });
  });
});

describe('submitFeePaymentClaim', () => {
  it('claims the fee plan amount, whatever else is sent', async () => {
    const r = await submitFeePaymentClaim(supabase, { ...goodInput, amount: 1 } as any);
    expect(r.ok).toBe(true);
    expect(inserted[0]).toMatchObject({ amount: 13500, installment_number: 2, utr: '412345678901', method: 'upi_direct' });
  });

  it('nothing due: refused', async () => {
    feeState.view.nextDue = null;
    const r = await submitFeePaymentClaim(supabase, goodInput);
    expect(r).toMatchObject({ ok: false, code: 'NOTHING_DUE' });
    expect(inserted).toHaveLength(0);
  });

  it('not a student yet: refused (the enrolment link handles joining)', async () => {
    feeState.user.user_type = 'lead';
    const r = await submitFeePaymentClaim(supabase, goodInput);
    expect(r).toMatchObject({ ok: false, code: 'NOTHING_DUE' });
  });

  it('one claim waits at a time', async () => {
    pendingClaim = { id: 'claim-0' };
    const r = await submitFeePaymentClaim(supabase, goodInput);
    expect(r).toMatchObject({ ok: false, code: 'CLAIM_PENDING' });
  });

  it('a UTR already on a payment or enrolment link is refused', async () => {
    utrHits.payments = { id: 'pay-1' };
    expect(await submitFeePaymentClaim(supabase, goodInput)).toMatchObject({ ok: false, code: 'UTR_USED' });
    utrHits = { links: { id: 'link-1' } };
    expect(await submitFeePaymentClaim(supabase, goodInput)).toMatchObject({ ok: false, code: 'UTR_USED' });
  });

  it('saves a claim with no UTR at all (new students do not know the number)', async () => {
    const r = await submitFeePaymentClaim(supabase, { ...goodInput, transactionReference: '' });
    expect(r.ok).toBe(true);
    expect(inserted[0]).toMatchObject({ utr: null, proof_channel: 'upload' });
  });

  it('"sent on WhatsApp" needs no screenshot, once the student confirms they sent it', async () => {
    const r = await submitFeePaymentClaim(supabase, { ...goodInput, transactionReference: '', paymentProofUrl: null, proofChannel: 'whatsapp', whatsappSent: true });
    expect(r.ok).toBe(true);
    expect(inserted[0]).toMatchObject({ proof_channel: 'whatsapp', proof_url: null, utr: null });
  });

  it('"sent on WhatsApp" is refused when no WhatsApp number is set up', async () => {
    const r: any = await submitFeePaymentClaim(supabase, { ...goodInput, paymentProofUrl: null, proofChannel: 'whatsapp', whatsappSent: true, whatsappAllowed: false });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.fieldErrors)).toEqual(['proofChannel']);
  });

  it('"sent on WhatsApp" without the confirmation is refused', async () => {
    const r: any = await submitFeePaymentClaim(supabase, { ...goodInput, paymentProofUrl: null, proofChannel: 'whatsapp', whatsappSent: false });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.fieldErrors)).toEqual(['whatsappSent']);
  });

  it('remembers whose account the money came from', async () => {
    const r = await submitFeePaymentClaim(supabase, { ...goodInput, payerName: '  Appa (Suresh)  ' });
    expect(r.ok).toBe(true);
    expect(inserted[0]).toMatchObject({ payer_name: 'Appa (Suresh)' });
  });

  it('field errors for a short UTR, future date, missing screenshot', async () => {
    const r: any = await submitFeePaymentClaim(supabase, { ...goodInput, transactionReference: '123', paymentDate: '2999-01-01', paymentProofUrl: null });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.fieldErrors).sort()).toEqual(['paymentDate', 'paymentProofUrl', 'transactionReference']);
  });
});

describe('verifyFeePaymentClaim', () => {
  const claimRow = { id: 'claim-1', user_id: 'user-1', amount: '13500', paid_on: yesterday, method: 'upi_direct', utr: '412345678901', installment_number: 2, proof_url: 'https://x/1.jpg', status: 'pending' };

  it('records the payment once, with the claim id as the idempotency key', async () => {
    lockResult = { data: claimRow, error: null };
    recordOfficePayment.mockResolvedValue({ payment: { id: 'pay-9' }, view: { balance: 0 } });
    const r = await verifyFeePaymentClaim(supabase, 'claim-1', 'admin-1');
    expect(r).toMatchObject({ ok: true, paymentId: 'pay-9', balanceAfter: 0 });
    expect(recordOfficePayment).toHaveBeenCalledTimes(1);
    const [opts] = recordOfficePayment.mock.calls[0] as any[];
    expect(opts.line).toMatchObject({ key: 'fee-claim:claim-1', amount: 13500, method: 'upi_direct', reference: '412345678901', installmentNumber: 2 });
    expect(opts.adminId).toBe('admin-1');
  });

  it('a claim someone else already handled is not recorded again', async () => {
    lockResult = { data: null, error: null };
    const r = await verifyFeePaymentClaim(supabase, 'claim-1', 'admin-1');
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(recordOfficePayment).not.toHaveBeenCalled();
  });

  it('a refused payment releases the lock so staff can retry', async () => {
    lockResult = { data: claimRow, error: null };
    const err = Object.assign(new Error('Set the fee for this student first.'), { name: 'StudentFeeError' });
    recordOfficePayment.mockRejectedValue(err);
    const r = await verifyFeePaymentClaim(supabase, 'claim-1', 'admin-1');
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(updates.some((u) => u.table === 'fee_payment_claims' && u.payload.verified_at === null)).toBe(true);
  });
});

describe('rejectFeePaymentClaim', () => {
  it('marks it rejected with the reason', async () => {
    lockResult = { data: { id: 'claim-1', status: 'rejected' }, error: null };
    const r = await rejectFeePaymentClaim(supabase, 'claim-1', 'No such UTR in the statement');
    expect(r.ok).toBe(true);
    expect(updates[0].payload).toMatchObject({ status: 'rejected', rejection_reason: 'No such UTR in the statement' });
  });
});
