/**
 * The payment attempt state machine. Every change goes through the
 * payments_transition RPC, which checks the expected "from" state under a row
 * lock, writes the audit row and the outbox jobs in one transaction, and marks
 * the intent paid exactly once. The guards that belong to the application
 * (a proof is present, staff ticked the statement, a reason was given, a UTR
 * can be real) are checked here, before the database is touched.
 *
 *   created ──► awaiting_credit  (instant UPI order / Razorpay order)
 *           ──► awaiting_review  (screenshot uploaded or "sent on WhatsApp")
 *   awaiting_credit ──► succeeded | expired | failed | cancelled
 *   awaiting_review ──► succeeded (staff verify) | rejected (staff, with reason)
 *   expired ──► succeeded  (a late credit still counts while the intent is open)
 */
import type { PaymentActorType, PaymentAttemptMethod, PaymentAttemptRow, PaymentAttemptState, ProofChannel } from '../../types/payments-v2';
import { normaliseTransactionRef } from '../../utils/student-pay';
import type { OutboxJobSpec } from './outbox';

export interface Actor {
  type: PaymentActorType;
  id?: string | null;
}

/** Columns payments_transition() will patch. Anything else is ignored by the function. */
export interface AttemptPatch {
  utr?: string | null;
  payer_vpa?: string | null;
  payer_name?: string | null;
  paid_on_claimed?: string | null;
  proof_object_path?: string | null;
  proof_channel?: ProofChannel | null;
  proof_sha256?: string | null;
  matched_credit_id?: string | null;
  review_by?: string | null;
  review_at?: string | null;
  review_decision?: 'verify' | 'reject' | null;
  review_note?: string | null;
  statement_checked?: boolean;
  failure_code?: string | null;
  failure_reason?: string | null;
  provider?: string | null;
  provider_order_id?: string | null;
  provider_payment_id?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface TransitionInput {
  attemptId: string;
  from: PaymentAttemptState[];
  to: PaymentAttemptState;
  patch?: AttemptPatch;
  actor?: Actor;
  action?: string;
  jobs?: OutboxJobSpec[];
  ipHash?: string | null;
}

export type TransitionResult =
  | { ok: true; attempt: PaymentAttemptRow; duplicate: boolean }
  | { ok: false; code: 'NOT_FOUND' | 'WRONG_STATE' | 'PROOF_REQUIRED' | 'UTR_INVALID' | 'STATEMENT_REQUIRED' | 'REASON_REQUIRED' | 'INTENT_ALREADY_PAID' | 'INTENT_NOT_OPEN'; state?: string };

export async function transitionAttempt(supabase: any, input: TransitionInput): Promise<TransitionResult> {
  const { data, error } = await supabase.rpc('payments_transition', {
    p_attempt_id: input.attemptId,
    p_from_states: input.from,
    p_to_state: input.to,
    p_patch: input.patch || {},
    p_actor_type: input.actor?.type || 'system',
    p_actor_id: input.actor?.id || null,
    p_action: input.action || null,
    p_jobs: input.jobs || [],
    p_ip_hash: input.ipHash || null,
  });
  if (error) throw new Error(error.message || 'payments_transition failed');
  if (!data?.ok) return { ok: false, code: data?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'WRONG_STATE', state: data?.state };
  return { ok: true, attempt: data.attempt as PaymentAttemptRow, duplicate: Boolean(data.duplicate) };
}

export interface CreateAttemptInput {
  intentId: string;
  method: PaymentAttemptMethod;
  amountPaise: number;
  paiseTag?: number | null;
  convenienceFeePaise?: number;
  expiresAt?: string | null;
  idempotencyKey?: string | null;
  clientIpHash?: string | null;
  clientUa?: string | null;
  provider?: string | null;
  providerOrderId?: string | null;
  metadata?: Record<string, unknown>;
}

/** A new attempt in 'created'. The caller moves it on with one of the transitions below. */
export async function createAttempt(supabase: any, input: CreateAttemptInput): Promise<PaymentAttemptRow> {
  const { data, error } = await supabase
    .from('payment_attempts')
    .insert({
      intent_id: input.intentId,
      method: input.method,
      state: 'created',
      amount_paise: input.amountPaise,
      paise_tag: input.paiseTag ?? null,
      convenience_fee_paise: input.convenienceFeePaise ?? 0,
      expires_at: input.expiresAt ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      client_ip_hash: input.clientIpHash ?? null,
      client_ua: input.clientUa ? String(input.clientUa).slice(0, 300) : null,
      provider: input.provider ?? null,
      provider_order_id: input.providerOrderId ?? null,
      metadata: input.metadata || {},
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as PaymentAttemptRow;
}

export interface SubmitProofInput {
  attemptId: string;
  method: 'upi_proof' | 'bank_proof';
  proofChannel: ProofChannel;
  proofObjectPath?: string | null;
  proofSha256?: string | null;
  utr?: string | null;
  payerName?: string | null;
  /** YYYY-MM-DD, the day the student says they paid. */
  paidOn: string;
  actorId: string;
  ipHash?: string | null;
}

/** The student says they paid: a screenshot on the page, or sent on WhatsApp. The UTR is optional. */
export async function submitProof(supabase: any, input: SubmitProofInput): Promise<TransitionResult> {
  if (input.proofChannel === 'upload' && !input.proofObjectPath) return { ok: false, code: 'PROOF_REQUIRED' };
  const rawUtr = typeof input.utr === 'string' ? input.utr.trim() : '';
  const utr = rawUtr ? normaliseTransactionRef(rawUtr, input.method === 'bank_proof' ? 'bank_transfer' : 'upi_direct') : null;
  if (rawUtr && !utr) return { ok: false, code: 'UTR_INVALID' };

  return transitionAttempt(supabase, {
    attemptId: input.attemptId,
    from: ['created'],
    to: 'awaiting_review',
    patch: {
      proof_channel: input.proofChannel,
      proof_object_path: input.proofObjectPath || null,
      proof_sha256: input.proofSha256 || null,
      utr,
      payer_name: input.payerName?.trim() || null,
      paid_on_claimed: input.paidOn,
    },
    actor: { type: 'student', id: input.actorId },
    action: 'submit_proof',
    jobs: [{ job: 'email_student:submitted' }, { job: 'alert_staff:verify' }],
    ipHash: input.ipHash || null,
  });
}

export interface ReviewInput {
  attemptId: string;
  decision: 'verify' | 'reject';
  staffId: string;
  note?: string | null;
  /** "I found this amount in the bank statement." Required to verify. */
  statementChecked?: boolean;
}

/** Staff decide a proof attempt. Verify needs the statement tick; reject needs a real reason. */
export async function reviewAttempt(supabase: any, input: ReviewInput): Promise<TransitionResult> {
  const note = input.note?.trim() || null;
  const now = new Date().toISOString();
  if (input.decision === 'verify') {
    if (!input.statementChecked) return { ok: false, code: 'STATEMENT_REQUIRED' };
    // Verifying a screenshot for money that already paid this intent (an Instant UPI
    // match, or another attempt) must not mint a second ledger row or a "refund" bell.
    const { data: row, error: aErr } = await supabase.from('payment_attempts').select('intent_id').eq('id', input.attemptId).maybeSingle();
    if (aErr) throw aErr;
    if (row?.intent_id) {
      const { data: intent, error: iErr } = await supabase.from('payment_intents').select('status').eq('id', row.intent_id).maybeSingle();
      if (iErr) throw iErr;
      if (intent && intent.status === 'paid') return { ok: false, code: 'INTENT_ALREADY_PAID' };
      if (intent && intent.status !== 'open') return { ok: false, code: 'INTENT_NOT_OPEN', state: intent.status };
    }
    return transitionAttempt(supabase, {
      attemptId: input.attemptId,
      from: ['awaiting_review'],
      to: 'succeeded',
      patch: { review_by: input.staffId, review_at: now, review_decision: 'verify', review_note: note, statement_checked: true },
      actor: { type: 'staff', id: input.staffId },
      action: 'review_verify',
      jobs: [{ job: 'fulfil_intent' }],
    });
  }
  if (!note || note.length < 5) return { ok: false, code: 'REASON_REQUIRED' };
  return transitionAttempt(supabase, {
    attemptId: input.attemptId,
    from: ['awaiting_review'],
    to: 'rejected',
    patch: { review_by: input.staffId, review_at: now, review_decision: 'reject', review_note: note },
    actor: { type: 'staff', id: input.staffId },
    action: 'review_reject',
    jobs: [{ job: 'email_student:rejected', payload: { reason: note } }],
  });
}

export interface MarkCreditedInput {
  attemptId: string;
  creditId?: string | null;
  utr?: string | null;
  payerVpa?: string | null;
  payerName?: string | null;
  providerPaymentId?: string | null;
  actor: Actor;
  action?: string;
}

/** Money arrived (a bank credit matched, or Razorpay captured). Late credits on expired orders still count. */
export async function markCredited(supabase: any, input: MarkCreditedInput): Promise<TransitionResult> {
  const patch: AttemptPatch = {};
  if (input.creditId !== undefined) patch.matched_credit_id = input.creditId;
  if (input.utr !== undefined) patch.utr = input.utr;
  if (input.payerVpa !== undefined) patch.payer_vpa = input.payerVpa;
  if (input.payerName !== undefined) patch.payer_name = input.payerName;
  if (input.providerPaymentId !== undefined) patch.provider_payment_id = input.providerPaymentId;
  return transitionAttempt(supabase, {
    attemptId: input.attemptId,
    from: ['awaiting_credit', 'expired', 'awaiting_review'],
    to: 'succeeded',
    patch,
    actor: input.actor,
    action: input.action || 'credit_matched',
    jobs: [{ job: 'fulfil_intent' }],
  });
}

/**
 * A bank credit matched this order but policy says a person must look first
 * (above the instant cap, or only one channel above the two-channel line).
 * The credit is attached so the verify card shows it; staff then verify.
 */
export async function holdForReview(supabase: any, input: { attemptId: string; creditId: string | null; reason: string; actor: Actor }): Promise<TransitionResult> {
  return transitionAttempt(supabase, {
    attemptId: input.attemptId,
    from: ['awaiting_credit', 'expired'],
    to: 'awaiting_review',
    patch: { matched_credit_id: input.creditId, metadata: { review_reason: input.reason } },
    actor: input.actor,
    action: 'held_for_review',
    jobs: [{ job: 'alert_staff:verify', payload: { reason: input.reason } }],
  });
}

export async function expireAttempt(supabase: any, attemptId: string): Promise<TransitionResult> {
  return transitionAttempt(supabase, { attemptId, from: ['created', 'awaiting_credit'], to: 'expired', actor: { type: 'system' }, action: 'expired' });
}

export async function failAttempt(supabase: any, input: { attemptId: string; code: string | null; reason: string | null; actor: Actor }): Promise<TransitionResult> {
  return transitionAttempt(supabase, {
    attemptId: input.attemptId,
    from: ['created', 'awaiting_credit'],
    to: 'failed',
    patch: { failure_code: input.code, failure_reason: input.reason },
    actor: input.actor,
    action: 'failed',
    jobs: [{ job: 'email_student:failed', payload: { code: input.code, reason: input.reason } }],
  });
}

export async function cancelAttempt(supabase: any, input: { attemptId: string; actor: Actor }): Promise<TransitionResult> {
  return transitionAttempt(supabase, { attemptId: input.attemptId, from: ['created', 'awaiting_credit'], to: 'cancelled', actor: input.actor, action: 'cancelled' });
}
