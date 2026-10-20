/**
 * Phase 0 bridge between the legacy routes and the payments model.
 *
 * The legacy paths (enrol complete, pay-balance, Admin verify-payment, Admin
 * fee-claims) keep their behaviour and stay the source of truth. Alongside,
 * every submission becomes an intent plus an awaiting_review attempt, and
 * every staff decision moves that attempt, so the audit trail, the outbox and
 * the ledger stamp exist from day one. Nothing here may throw into a route.
 */
import type { PaymentScheme, ProofChannel } from '../../types/payments-v2';
import { proofObjectPath } from '../../utils/payment-proof';
import { getOrCreateEnrolmentIntent, getOrCreateInstallmentIntent } from './intents';
import { createAttempt, submitProof, reviewAttempt } from './attempts';

type LegacyMethod = 'upi_direct' | 'bank_transfer';
const attemptMethod = (m: LegacyMethod) => (m === 'bank_transfer' ? 'bank_proof' : 'upi_proof') as 'bank_proof' | 'upi_proof';

export interface LegacyProofSubmission {
  link: any;
  userId: string;
  scheme: PaymentScheme;
  method: LegacyMethod;
  utr: string | null;
  paidOn: string;
  proofUrl: string | null;
  proofChannel?: ProofChannel | null;
  payerName?: string | null;
  ipHash?: string | null;
}

/** An enrolment-link submission (UTR + screenshot) becomes an awaiting_review attempt. */
export async function recordLegacyProofSubmission(supabase: any, input: LegacyProofSubmission): Promise<{ intentId: string; attemptId: string } | null> {
  try {
    const intent = await getOrCreateEnrolmentIntent(supabase, { link: input.link, scheme: input.scheme, userId: input.userId });
    if (!intent.ok) {
      console.error('[payments-bridge] no intent for link', input.link?.id, intent.code);
      return null;
    }
    const method = attemptMethod(input.method);
    const attempt = await createAttempt(supabase, {
      intentId: intent.intent.id,
      method,
      amountPaise: intent.amountPaise,
      metadata: { link_id: input.link.id, legacy: true },
    });
    const moved = await submitProof(supabase, {
      attemptId: attempt.id,
      method,
      proofChannel: input.proofChannel || 'upload',
      proofObjectPath: proofObjectPath(input.proofUrl),
      utr: input.utr,
      payerName: input.payerName || null,
      paidOn: input.paidOn,
      actorId: input.userId,
      ipHash: input.ipHash || null,
    });
    if (!moved.ok) {
      console.error('[payments-bridge] proof attempt not submitted', attempt.id, moved.code);
      return null;
    }
    return { intentId: intent.intent.id, attemptId: attempt.id };
  } catch (e: any) {
    console.error('[payments-bridge] link submission failed:', e?.message);
    return null;
  }
}

/** A pay-balance claim becomes an awaiting_review attempt that remembers the claim. */
export async function recordLegacyBalanceClaim(supabase: any, input: { claim: any; userId: string }): Promise<{ intentId: string; attemptId: string } | null> {
  try {
    const intent = await getOrCreateInstallmentIntent(supabase, { userId: input.userId });
    if (!intent.ok) {
      console.error('[payments-bridge] no installment intent for', input.userId, intent.code);
      return null;
    }
    const method = attemptMethod(input.claim.method);
    const attempt = await createAttempt(supabase, {
      intentId: intent.intent.id,
      method,
      amountPaise: intent.amountPaise,
      metadata: { claim_id: input.claim.id, legacy: true },
    });
    const moved = await submitProof(supabase, {
      attemptId: attempt.id,
      method,
      proofChannel: input.claim.proof_channel === 'whatsapp' ? 'whatsapp' : 'upload',
      proofObjectPath: proofObjectPath(input.claim.proof_url),
      utr: input.claim.utr || null,
      payerName: input.claim.payer_name || null,
      paidOn: input.claim.paid_on,
      actorId: input.userId,
    });
    if (!moved.ok) {
      console.error('[payments-bridge] claim attempt not submitted', attempt.id, moved.code);
      return null;
    }
    return { intentId: intent.intent.id, attemptId: attempt.id };
  } catch (e: any) {
    console.error('[payments-bridge] claim submission failed:', e?.message);
    return null;
  }
}

interface LegacyReview {
  decision: 'verify' | 'reject';
  staffId: string;
  reason?: string | null;
}

async function reviewWaiting(supabase: any, attemptId: string, r: LegacyReview): Promise<boolean> {
  const res =
    r.decision === 'verify'
      ? await reviewAttempt(supabase, { attemptId, decision: 'verify', staffId: r.staffId, statementChecked: true, note: 'Verified in Admin' })
      : await reviewAttempt(supabase, { attemptId, decision: 'reject', staffId: r.staffId, note: r.reason || 'Rejected in Admin' });
  if (!res.ok) console.error('[payments-bridge] review not applied', attemptId, res.code);
  return res.ok;
}

/** Staff decided a link submission in the legacy card: move its waiting attempt. */
export async function reviewLegacyLink(supabase: any, input: { linkId: string } & LegacyReview): Promise<boolean> {
  try {
    const { data: intents, error } = await supabase
      .from('payment_intents')
      .select('id')
      .eq('enrollment_link_id', input.linkId)
      .in('status', ['open', 'paid'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const intentId = intents?.[0]?.id;
    if (!intentId) return false;
    const { data: attempt, error: aErr } = await supabase.from('payment_attempts').select('id').eq('intent_id', intentId).eq('state', 'awaiting_review').limit(1).maybeSingle();
    if (aErr) throw aErr;
    if (!attempt) return false;
    return reviewWaiting(supabase, attempt.id, input);
  } catch (e: any) {
    console.error('[payments-bridge] link review failed:', e?.message);
    return false;
  }
}

/** Staff decided a pay-balance claim in Collections: move its waiting attempt. */
export async function reviewLegacyClaim(supabase: any, input: { claimId: string } & LegacyReview): Promise<boolean> {
  try {
    const { data: byMeta, error } = await supabase
      .from('payment_attempts')
      .select('id')
      .contains('metadata', { claim_id: input.claimId })
      .eq('state', 'awaiting_review')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    let attempt = byMeta;
    if (!attempt) {
      // Attempts backfilled by the migration carry legacy_ref 'claim:<id>' instead.
      const { data: byRef, error: refErr } = await supabase
        .from('payment_attempts')
        .select('id')
        .eq('legacy_ref', `claim:${input.claimId}`)
        .eq('state', 'awaiting_review')
        .limit(1)
        .maybeSingle();
      if (refErr) throw refErr;
      attempt = byRef;
    }
    if (!attempt) return false;
    return reviewWaiting(supabase, attempt.id, input);
  } catch (e: any) {
    console.error('[payments-bridge] claim review failed:', e?.message);
    return false;
  }
}
