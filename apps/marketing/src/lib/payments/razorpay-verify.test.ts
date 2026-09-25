import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { isValidRazorpaySignature, claimPendingPayment } from './razorpay-verify';

const SECRET = 'test_secret';
const sign = (orderId: string, paymentId: string) =>
  crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

describe('isValidRazorpaySignature', () => {
  it('accepts the signature Razorpay produces for the order and payment', () => {
    expect(
      isValidRazorpaySignature({ orderId: 'order_1', paymentId: 'pay_1', signature: sign('order_1', 'pay_1'), secret: SECRET }),
    ).toBe(true);
  });

  it('rejects a signature made for a different order', () => {
    expect(
      isValidRazorpaySignature({ orderId: 'order_2', paymentId: 'pay_1', signature: sign('order_1', 'pay_1'), secret: SECRET }),
    ).toBe(false);
  });

  it('rejects when the secret is missing, instead of signing with an empty key', () => {
    const emptyKeySig = crypto.createHmac('sha256', '').update('order_1|pay_1').digest('hex');
    expect(
      isValidRazorpaySignature({ orderId: 'order_1', paymentId: 'pay_1', signature: emptyKeySig, secret: undefined }),
    ).toBe(false);
  });

  it('rejects non-string and short inputs without throwing', () => {
    expect(isValidRazorpaySignature({ orderId: 1, paymentId: 'p', signature: 'x', secret: SECRET })).toBe(false);
    expect(isValidRazorpaySignature({ orderId: 'o', paymentId: 'p', signature: 'short', secret: SECRET })).toBe(false);
  });
});

/**
 * A fake PostgREST builder: records every .eq filter per query and answers
 * maybeSingle() from a queue of canned results.
 */
function fakeSupabase(results: Array<{ data: any; error: any }>) {
  const queries: Array<{ op: string; filters: Record<string, unknown>; values?: any }> = [];
  return {
    queries,
    from() {
      const q: { op: string; filters: Record<string, unknown>; values?: any } = { op: 'select', filters: {} };
      queries.push(q);
      const b: any = {
        update(values: any) { q.op = 'update'; q.values = values; return b; },
        select() { return b; },
        eq(col: string, val: unknown) { q.filters[col] = val; return b; },
        maybeSingle: async () => results.shift() ?? { data: null, error: null },
      };
      return b;
    },
  };
}

const args = { paymentId: 'row-full-fee', orderId: 'order_cheap', razorpayPaymentId: 'pay_1', signature: 'sig' };

describe('claimPendingPayment', () => {
  it('binds the update to the verified order and to pending rows only', async () => {
    const sb = fakeSupabase([{ data: { id: 'row-full-fee' }, error: null }]);
    const res = await claimPendingPayment(sb, { ...args, userId: 'u1' });
    expect(res.kind).toBe('claimed');
    expect(sb.queries[0].op).toBe('update');
    expect(sb.queries[0].filters).toEqual({
      id: 'row-full-fee',
      razorpay_order_id: 'order_cheap',
      status: 'pending',
      user_id: 'u1',
    });
  });

  it('returns not_found when the row id belongs to a different order (the cross-order attack)', async () => {
    const sb = fakeSupabase([{ data: null, error: null }, { data: null, error: null }]);
    const res = await claimPendingPayment(sb, args);
    expect(res.kind).toBe('not_found');
  });

  it('treats a replay of an already verified order as already_paid, without a second update', async () => {
    const sb = fakeSupabase([{ data: null, error: null }, { data: { id: 'row-full-fee', status: 'paid' }, error: null }]);
    const res = await claimPendingPayment(sb, args);
    expect(res.kind).toBe('already_paid');
    expect(sb.queries.filter((q) => q.op === 'update')).toHaveLength(1);
    expect(sb.queries[1].filters).toMatchObject({ razorpay_order_id: 'order_cheap', razorpay_payment_id: 'pay_1', status: 'paid' });
  });

  it('surfaces a database error instead of treating it as not found', async () => {
    const sb = fakeSupabase([{ data: null, error: { message: 'boom', code: 'XX000' } }]);
    const res = await claimPendingPayment(sb, args);
    expect(res.kind).toBe('error');
  });
});
