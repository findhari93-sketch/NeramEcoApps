/**
 * Fulfilment: a succeeded attempt becomes money on the ledger and, for an
 * enrolment, a student. It runs as the 'fulfil_intent' outbox job, so it must
 * be safe to run twice. It reuses the existing writers and the exact money
 * shape the Admin verify route wrote onto the link, so Collections, receipts,
 * reminders and the fee plan see nothing new.
 */
import type { PaymentAttemptRow, PaymentIntentRow } from '../../types/payments-v2';
import { finaliseDirectEnrolment } from '../direct-enrolment';
import { recordOfficePayment } from '../../queries/office-fees';
import { offerFromLink } from '../../utils/student-pay';
import { fromPaise } from '../../utils/paise';
import { istToday, addDaysToKey } from '../../utils/fee-plan';

export type FulfilResult =
  | { ok: true; paymentKey: string; applicationNumber?: string }
  | { ok: false; error: string; retryable: boolean };

/** How the ledger names the method of each attempt kind. */
export function ledgerMethodFor(method: PaymentAttemptRow['method']): 'upi_direct' | 'bank_transfer' | 'razorpay' {
  if (method === 'bank_proof') return 'bank_transfer';
  if (method === 'razorpay') return 'razorpay';
  return 'upi_direct';
}

/** The fee the attempt paid, with the paise tag or the online fee taken off. */
export function baseRupeesOf(attempt: Pick<PaymentAttemptRow, 'amount_paise' | 'paise_tag' | 'convenience_fee_paise'>): number {
  const extra = attempt.paise_tag ? Number(attempt.paise_tag) : Number(attempt.convenience_fee_paise || 0);
  return fromPaise(Number(attempt.amount_paise) - extra);
}

export async function fulfilIntent(supabase: any, attemptId: string): Promise<FulfilResult> {
  const { data: attempt, error: aErr } = await supabase.from('payment_attempts').select('*').eq('id', attemptId).maybeSingle();
  if (aErr) return { ok: false, error: aErr.message, retryable: true };
  if (!attempt) return { ok: false, error: 'No such attempt.', retryable: false };
  if (attempt.state !== 'succeeded' && attempt.state !== 'disputed') {
    return { ok: false, error: `Attempt is ${attempt.state}, not succeeded.`, retryable: false };
  }
  const { data: intent, error: iErr } = await supabase.from('payment_intents').select('*').eq('id', attempt.intent_id).maybeSingle();
  if (iErr) return { ok: false, error: iErr.message, retryable: true };
  if (!intent) return { ok: false, error: 'No such intent.', retryable: false };

  return intent.purpose === 'enrolment' ? fulfilEnrolment(supabase, attempt, intent) : fulfilInstallment(supabase, attempt, intent);
}

async function stampLedger(supabase: any, paymentKey: string, attempt: PaymentAttemptRow, extra: Record<string, unknown> = {}) {
  const { error } = await supabase.from('payments').update({ attempt_id: attempt.id, ...extra }).eq('idempotency_key', paymentKey).is('attempt_id', null);
  if (error) console.error('[fulfil] ledger stamp failed:', error.message);
}

async function fulfilEnrolment(supabase: any, attempt: PaymentAttemptRow, intent: PaymentIntentRow): Promise<FulfilResult> {
  const { data: link, error } = await supabase.from('direct_enrollment_links').select('*').eq('id', intent.enrollment_link_id).maybeSingle();
  if (error) return { ok: false, error: error.message, retryable: true };
  if (!link) return { ok: false, error: 'The enrolment link is gone.', retryable: false };
  const paymentKey = `direct-link:${link.id}`;

  if (link.status === 'used') {
    // Already enrolled (a retry, or staff verified by hand): only make sure the ledger points here.
    await stampLedger(supabase, paymentKey, attempt);
    return { ok: true, paymentKey };
  }
  if (!intent.user_id) return { ok: false, error: 'No student account on this payment.', retryable: false };
  if (!link.submitted_form) return { ok: false, error: 'The student details were never saved on this link.', retryable: false };

  const offer = offerFromLink(link);
  const amount = baseRupeesOf(attempt);
  const paidOn = attempt.paid_on_claimed || istToday();
  const isInstallment = intent.scheme === 'installment';
  const money = isInstallment
    ? {
        payment_scheme: 'installment',
        total_fee: offer.listFee,
        discount_amount: offer.extraDiscount,
        final_fee: offer.installmentTotal,
        amount_paid: amount,
        installment_2_amount: offer.installment2,
        installment_2_due_date: link.installment_2_due_date || addDaysToKey(paidOn, Number(link.offer_balance_due_days) || 45),
      }
    : {
        payment_scheme: 'full',
        total_fee: offer.listFee,
        discount_amount: Math.max(0, offer.listFee - offer.fullAmount),
        final_fee: offer.fullAmount,
        amount_paid: amount,
        installment_2_amount: null,
        installment_2_due_date: null,
      };
  const method = ledgerMethodFor(attempt.method);
  const howPaid = { payment_method: method, transaction_reference: attempt.utr || null, payment_date: paidOn, payment_proof_url: attempt.proof_object_path || null };

  const { error: moneyErr } = await supabase.from('direct_enrollment_links').update({ ...money, ...howPaid }).eq('id', link.id);
  if (moneyErr) return { ok: false, error: moneyErr.message, retryable: true };

  const result = await finaliseDirectEnrolment(supabase, {
    link: { ...link, ...money, ...howPaid },
    userId: intent.user_id,
    form: link.submitted_form,
    payment: { method, date: paidOn, reference: attempt.utr || null, proofUrl: attempt.proof_object_path || null, utr: attempt.utr || null },
    verifiedBy: attempt.review_by || null,
  });
  if (!result.ok) return { ok: false, error: result.error, retryable: result.status >= 500 };

  await stampLedger(supabase, result.paymentKey || paymentKey, attempt);
  return { ok: true, paymentKey: result.paymentKey || paymentKey, applicationNumber: result.applicationNumber };
}

async function fulfilInstallment(supabase: any, attempt: PaymentAttemptRow, intent: PaymentIntentRow): Promise<FulfilResult> {
  if (!intent.user_id) return { ok: false, error: 'No student account on this payment.', retryable: false };
  const method = ledgerMethodFor(attempt.method);

  // Phase 0 bridge: staff verified this through the legacy claim card, which
  // already recorded the money under fee-claim:<id>. Recording again would
  // double the ledger; only point that row at this attempt.
  const claimId = (attempt.metadata as any)?.claim_id;
  if (claimId) {
    const legacyKey = `fee-claim:${claimId}`;
    await stampLedger(supabase, legacyKey, attempt);
    return { ok: true, paymentKey: legacyKey };
  }

  const key = `attempt:${attempt.id}`;
  const paidOn = attempt.paid_on_claimed || istToday();
  const installmentNumber = (intent.metadata as any)?.installment_number ?? null;
  try {
    await recordOfficePayment(
      {
        userId: intent.user_id,
        line: {
          key,
          amount: baseRupeesOf(attempt),
          paidOn,
          method: method === 'razorpay' ? 'manual' : method,
          reference: attempt.utr || null,
          installmentNumber,
        },
        adminId: attempt.review_by || null,
      } as any,
      supabase,
    );
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Could not record the payment.', retryable: err?.name !== 'StudentFeeError' };
  }
  await stampLedger(supabase, key, attempt, {
    direct_payment_utr: attempt.utr || null,
    direct_payment_screenshot_url: attempt.proof_object_path || null,
    screenshot_url: attempt.proof_object_path || null,
    screenshot_verified: true,
    verified_by: attempt.review_by || null,
    verified_at: new Date().toISOString(),
    description: `Balance paid by ${method === 'bank_transfer' ? 'bank transfer' : method === 'razorpay' ? 'card or net banking' : 'UPI'}${attempt.review_by ? ', verified against the bank' : ', confirmed from the bank alert'}${attempt.utr ? `. UTR ${attempt.utr}` : ''}`,
  });
  return { ok: true, paymentKey: key };
}
