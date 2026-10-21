/**
 * get_payment_status (2026-10-20): what the signed-in student owes and where
 * to pay it, as a card with one button per payment. Read only; the card's
 * buttons open the payment pages. See lib/aintra/payments.ts.
 */
import { isE2ETestRun } from '@/lib/e2e-mode';
import { formatBookMarker } from '../booking';
import { describePaymentOptions, loadPaymentOptions, NO_PAYMENT_OPTIONS } from '../payments';
import type { ToolContext, ToolResult } from './types';

const PAY_CARD = formatBookMarker({ kind: 'pay', date: null, window: null });

export async function getPaymentStatusTool(ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.userId) {
    return {
      ok: true,
      data: { mode: 'needs_sign_in', next_step: 'Their fees show after they sign in on the card.' },
      card: PAY_CARD,
    };
  }
  try {
    const options = isE2ETestRun() ? NO_PAYMENT_OPTIONS : await loadPaymentOptions(ctx.userId, ctx.now ?? new Date());
    return { ok: true, data: describePaymentOptions(options), card: PAY_CARD };
  } catch (err) {
    console.error('[aintra/get-payment-status]', err);
    return { ok: false, error: 'tool_error' };
  }
}
