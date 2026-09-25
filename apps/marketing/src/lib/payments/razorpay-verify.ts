import crypto from 'crypto';

/**
 * Razorpay signs `order_id|payment_id` with the key secret. Compare in constant
 * time so the check does not leak how many leading characters matched.
 */
export function isValidRazorpaySignature({
  orderId,
  paymentId,
  signature,
  secret,
}: {
  orderId: unknown;
  paymentId: unknown;
  signature: unknown;
  secret: string | undefined;
}): boolean {
  if (!secret) return false;
  if (typeof orderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') {
    return false;
  }
  if (!orderId || !paymentId || !signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const PAYMENT_WITH_LEAD = `
  *,
  lead_profiles(id, user_id, interest_course, payment_scheme, final_fee, full_payment_discount, discount_amount, assigned_fee, selected_course_id)
`;

export type ClaimResult =
  | { kind: 'claimed'; payment: any }
  | { kind: 'already_paid'; payment: any }
  | { kind: 'not_found' }
  | { kind: 'error'; error: unknown };

/**
 * Marks a pending payment row as paid, but only the row that belongs to the
 * Razorpay order whose signature was just verified. Matching by the row id
 * alone let a valid signature from one (cheap) order mark a different row paid.
 *
 * Only a `pending` row transitions, so a replayed verify call cannot rerun the
 * side effects (installment insert, fee_paid increment). A replay of the same
 * order that already succeeded returns `already_paid` so the client still gets
 * its receipt.
 */
export async function claimPendingPayment(
  supabase: any,
  {
    paymentId,
    orderId,
    razorpayPaymentId,
    signature,
    userId,
    now = new Date(),
  }: {
    paymentId: string;
    orderId: string;
    razorpayPaymentId: string;
    signature: string;
    userId?: string | null;
    now?: Date;
  },
): Promise<ClaimResult> {
  let update = supabase
    .from('payments')
    .update({
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: signature,
      status: 'paid',
      paid_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', paymentId)
    .eq('razorpay_order_id', orderId)
    .eq('status', 'pending');
  if (userId) update = update.eq('user_id', userId);

  const { data: claimed, error: claimError } = await update.select(PAYMENT_WITH_LEAD).maybeSingle();
  if (claimError) return { kind: 'error', error: claimError };
  if (claimed) return { kind: 'claimed', payment: claimed };

  // Nothing pending matched. Either this exact order was already verified (a
  // retry), or the id and order do not belong together.
  let existing = supabase
    .from('payments')
    .select(PAYMENT_WITH_LEAD)
    .eq('id', paymentId)
    .eq('razorpay_order_id', orderId)
    .eq('razorpay_payment_id', razorpayPaymentId)
    .eq('status', 'paid');
  if (userId) existing = existing.eq('user_id', userId);

  const { data: paid, error: paidError } = await existing.maybeSingle();
  if (paidError) return { kind: 'error', error: paidError };
  if (paid) return { kind: 'already_paid', payment: paid };
  return { kind: 'not_found' };
}
