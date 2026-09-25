import { describe, it, expect, vi, beforeEach } from 'vitest';

const validateCouponForUser = vi.fn();
vi.mock('@neram/database', () => ({ validateCouponForUser: (...a: unknown[]) => validateCouponForUser(...a) }));

import { resolveCouponDiscount } from './coupon-discount';

beforeEach(() => validateCouponForUser.mockReset());

describe('resolveCouponDiscount', () => {
  it('is zero with no coupon code, without touching the database', async () => {
    expect(await resolveCouponDiscount({ code: null, leadProfileId: 'l1', finalFee: 30000 })).toEqual({ ok: true, discount: 0 });
    expect(validateCouponForUser).not.toHaveBeenCalled();
  });

  it('refuses an expired, used-up or someone-else coupon instead of applying it', async () => {
    validateCouponForUser.mockResolvedValue({ valid: false, error: 'This coupon has expired' });
    expect(await resolveCouponDiscount({ code: 'OLD', leadProfileId: 'l1', finalFee: 30000 })).toEqual({
      ok: false,
      error: 'This coupon has expired',
    });
  });

  it('validates for this lead against the final fee the dialog shows', async () => {
    validateCouponForUser.mockResolvedValue({ valid: true, discountAmount: 3000, coupon: { max_discount: null } });
    const client = {};
    const res = await resolveCouponDiscount({ code: ' SAVE10 ', leadProfileId: 'l1', finalFee: 30000, client });
    expect(res).toEqual({ ok: true, discount: 3000 });
    expect(validateCouponForUser).toHaveBeenCalledWith('SAVE10', 'l1', 30000, undefined, client);
  });

  it('applies the coupon max_discount cap', async () => {
    validateCouponForUser.mockResolvedValue({ valid: true, discountAmount: 9000, coupon: { max_discount: 2000 } });
    expect(await resolveCouponDiscount({ code: 'BIG', leadProfileId: 'l1', finalFee: 30000 })).toEqual({ ok: true, discount: 2000 });
  });
});
