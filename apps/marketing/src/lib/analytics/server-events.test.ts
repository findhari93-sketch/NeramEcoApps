// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { anonymousIdFromRequest, buildServerEventRow, orderIdPrefix, recordServerEvent, safeMetadata } from './server-events';

describe('orderIdPrefix', () => {
  it('keeps only the start of the order id', () => {
    expect(orderIdPrefix('order_PQ12345678901234')).toBe('order_PQ1234');
    expect(orderIdPrefix('')).toBeNull();
    expect(orderIdPrefix(undefined)).toBeNull();
    expect(orderIdPrefix(42)).toBeNull();
  });
});

describe('safeMetadata', () => {
  it('drops secrets and personal details, keeps plain values', () => {
    expect(
      safeMetadata({
        amount: 15000,
        payment_scheme: 'full',
        coupon_applied: true,
        razorpay_signature: 'sig',
        razorpay_payment_id: 'pay_1',
        key_secret: 'x',
        email: 'a@b.c',
        phone: '999',
        nested: { a: 1 },
        note: null,
      }),
    ).toEqual({ amount: 15000, payment_scheme: 'full', coupon_applied: true, note: null });
  });
});

describe('buildServerEventRow', () => {
  it('files payment events under the enrollment funnel from the marketing app', () => {
    const row = buildServerEventRow({
      event: 'payment_failed',
      status: 'failed',
      userId: 'u1',
      anonymousId: `anon_${'a'.repeat(32)}`,
      errorCode: 'invalid_signature',
      metadata: { order_id_prefix: 'order_ABC', razorpay_signature: 'nope' },
    });
    expect(row).toMatchObject({
      user_id: 'u1',
      anonymous_id: `anon_${'a'.repeat(32)}`,
      funnel: 'enrollment',
      event: 'payment_failed',
      status: 'failed',
      error_code: 'invalid_signature',
      source_app: 'marketing',
      metadata: { order_id_prefix: 'order_ABC' },
    });
  });

  it('refuses an anonymous id that is not ours', () => {
    expect(buildServerEventRow({ event: 'payment_started', status: 'started', anonymousId: "x'; drop" }).anonymous_id).toBeNull();
  });
});

describe('anonymousIdFromRequest', () => {
  it('reads the shared cookie', () => {
    const id = `anon_${'b'.repeat(32)}`;
    const req = { headers: { get: (n: string) => (n === 'cookie' ? `a=1; neram_anon_id=${id}` : null) } };
    expect(anonymousIdFromRequest(req)).toBe(id);
    expect(anonymousIdFromRequest({ headers: { get: () => null } })).toBeNull();
  });
});

describe('recordServerEvent', () => {
  it('never throws when the insert fails', async () => {
    const client = {
      from: () => {
        throw new Error('network down');
      },
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordServerEvent(client as never, { event: 'payment_started', status: 'started' })).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('inserts one row through the admin client', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null });
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const client = { from: vi.fn(() => ({ insert })) };
    await recordServerEvent(client as never, { event: 'payment_completed', status: 'completed', metadata: { amount: 100 } });
    expect(client.from).toHaveBeenCalledWith('user_funnel_events');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ event: 'payment_completed', funnel: 'enrollment' }));
  });
});
