import { validateCouponForUser } from '@neram/database';

export type CouponDiscountResult =
  | { ok: true; discount: number }
  | { ok: false; error: string };

/**
 * The discount a coupon is worth on this lead's fee, decided on the server.
 *
 * Runs the same checks as /api/coupon/validate (active, validity window, usage
 * limit, minimum amount, user-specific coupons), on the same base the payment
 * dialog shows (the lead's final fee), then applies the coupon's max_discount
 * cap. The client's own discount figure is never used.
 */
export async function resolveCouponDiscount({
  code,
  leadProfileId,
  finalFee,
  client,
}: {
  code: unknown;
  leadProfileId: string;
  finalFee: number;
  client?: any;
}): Promise<CouponDiscountResult> {
  if (typeof code !== 'string' || !code.trim()) return { ok: true, discount: 0 };

  const result = await validateCouponForUser(code.trim(), leadProfileId, Number(finalFee), undefined, client);
  if (!result.valid) {
    return { ok: false, error: result.error || 'This coupon cannot be applied' };
  }

  let discount = Number(result.discountAmount) || 0;
  const cap = (result.coupon as { max_discount?: number | null } | undefined)?.max_discount;
  if (cap != null && discount > cap) discount = cap;
  return { ok: true, discount: Math.max(0, discount) };
}
