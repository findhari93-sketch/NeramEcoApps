/**
 * Pay balance: an enrolled student pays what is next due on their fee plan
 * (the second installment, or the plain balance) to the trust by UPI or bank
 * transfer, then submits the UTR and a screenshot. That is a claim
 * (fee_payment_claims, status 'pending'). Staff verify it against the bank,
 * and only then is the payment recorded through recordOfficePayment, so
 * Collections, the installment schedule and the reminders all see it.
 *
 * The amount is always the fee plan's next due, read on the server.
 */
import { loadStudentFeeState, recordOfficePayment } from '../queries/office-fees';
import { normaliseTransactionRef, type StudentPayMethod } from '../utils/student-pay';
import { istToday, isDateKey } from '../utils/fee-plan';

export interface BalanceDue {
  /** What to pay now. Null when nothing is owed or no fee is set. */
  amount: number | null;
  installmentNumber: number | null;
  installmentId: string | null;
  dueDate: string | null;
  agreed: number | null;
  paidTotal: number;
  balance: number | null;
  leadProfileId: string | null;
  studentName: string | null;
  isStudent: boolean;
}

export async function loadBalanceDue(supabase: any, userId: string): Promise<BalanceDue> {
  const state = await loadStudentFeeState(supabase, userId);
  const next = state.view.nextDue;
  return {
    amount: next && next.amount > 0.01 ? Math.round(next.amount * 100) / 100 : null,
    installmentNumber: next?.number ?? null,
    installmentId: next?.installmentId ?? null,
    dueDate: next?.dueDate ?? null,
    agreed: state.view.agreed,
    paidTotal: state.view.paidTotal,
    balance: state.view.balance,
    leadProfileId: state.lead?.id ?? null,
    studentName: state.lead?.first_name || state.user?.name || null,
    isStudent: state.user?.user_type === 'student',
  };
}

/** True when this UTR already backs a claim, an enrolment-link payment or a recorded payment. */
export async function isUtrTaken(supabase: any, utr: string, exceptClaimId?: string): Promise<boolean> {
  let claims = supabase.from('fee_payment_claims').select('id').eq('utr', utr).in('status', ['pending', 'verified']).limit(1);
  if (exceptClaimId) claims = claims.neq('id', exceptClaimId);
  const [c, l, p] = await Promise.all([
    claims.maybeSingle(),
    supabase.from('direct_enrollment_links').select('id').eq('submitted_utr', utr).limit(1).maybeSingle(),
    supabase.from('payments').select('id').eq('direct_payment_utr', utr).limit(1).maybeSingle(),
  ]);
  for (const r of [c, l, p]) if (r.error) throw r.error;
  return Boolean(c.data || l.data || p.data);
}

export type SubmitClaimResult =
  | { ok: true; claim: any; due: BalanceDue }
  | { ok: false; status: number; error: string; code?: string; fieldErrors?: Record<string, string> };

export interface SubmitClaimInput {
  userId: string;
  method: unknown;
  transactionReference: unknown;
  paymentDate: unknown;
  paymentProofUrl: unknown;
  /** 'upload' (default) or 'whatsapp': the screenshot went to our WhatsApp instead. */
  proofChannel?: unknown;
  /** WhatsApp channel: the student ticked "I have sent it". */
  whatsappSent?: unknown;
  /** Whose account the money came from, when not the student's. */
  payerName?: unknown;
  /** False when Settings has no WhatsApp number: the channel is then refused. Default true. */
  whatsappAllowed?: boolean;
}

/**
 * The student says they paid. Proof is a screenshot on the page OR "sent on
 * WhatsApp"; the UTR is optional (new students rarely know it) but must look
 * real when given. The amount is the fee plan's, never the browser's.
 */
export async function submitFeePaymentClaim(supabase: any, input: SubmitClaimInput): Promise<SubmitClaimResult> {
  const method: StudentPayMethod | null =
    input.method === 'bank_transfer' ? 'bank_transfer' : input.method === 'upi_direct' ? 'upi_direct' : null;
  const rawUtr = typeof input.transactionReference === 'string' ? input.transactionReference.trim() : '';
  const utr = rawUtr && method ? normaliseTransactionRef(rawUtr, method) : null;
  const today = istToday();
  const paidOn = isDateKey(input.paymentDate) && (input.paymentDate as string) <= today ? (input.paymentDate as string) : null;
  const proofUrl = typeof input.paymentProofUrl === 'string' && input.paymentProofUrl.startsWith('http') ? input.paymentProofUrl : null;
  const proofChannel: 'upload' | 'whatsapp' = input.proofChannel === 'whatsapp' ? 'whatsapp' : 'upload';
  const whatsappSent = input.whatsappSent === true;
  const payerName = typeof input.payerName === 'string' ? input.payerName.trim().slice(0, 80) || null : null;

  const fieldErrors: Record<string, string> = {};
  if (!method) fieldErrors.paymentMethod = 'Choose UPI or bank transfer.';
  if (rawUtr && method && !utr) {
    fieldErrors.transactionReference =
      method === 'upi_direct'
        ? 'A UPI reference (UTR) is 12 digits. Leave it empty if you cannot find it.'
        : 'A bank reference is 12 to 22 letters and digits. Leave it empty if you cannot find it.';
  }
  if (!paidOn) fieldErrors.paymentDate = 'Choose the day you paid (not a future date).';
  if (proofChannel === 'upload' && !proofUrl) fieldErrors.paymentProofUrl = 'Upload the payment screenshot, or choose "I sent it on WhatsApp".';
  if (proofChannel === 'whatsapp' && input.whatsappAllowed === false) {
    fieldErrors.proofChannel = 'Sending on WhatsApp is not available right now. Upload the screenshot instead.';
  } else if (proofChannel === 'whatsapp' && !whatsappSent) {
    fieldErrors.whatsappSent = 'Tick the box once you have sent the screenshot on WhatsApp.';
  }
  if (Object.keys(fieldErrors).length) return { ok: false, status: 400, error: 'Check the highlighted fields.', fieldErrors };

  const due = await loadBalanceDue(supabase, input.userId);
  if (!due.isStudent || due.amount === null) {
    return { ok: false, status: 409, code: 'NOTHING_DUE', error: 'There is nothing to pay on your account right now.' };
  }

  const { data: waiting, error: waitErr } = await supabase
    .from('fee_payment_claims')
    .select('id')
    .eq('user_id', input.userId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();
  if (waitErr) throw waitErr;
  if (waiting) {
    return { ok: false, status: 409, code: 'CLAIM_PENDING', error: 'Your last payment is still being verified. We will email you soon.' };
  }

  if (utr && (await isUtrTaken(supabase, utr))) {
    return {
      ok: false,
      status: 409,
      code: 'UTR_USED',
      error: 'This reference number was already used for another payment. Check the number in your payment app.',
      fieldErrors: { transactionReference: 'Already used for another payment.' },
    };
  }

  const { data: claim, error } = await supabase
    .from('fee_payment_claims')
    .insert({
      user_id: input.userId,
      lead_profile_id: due.leadProfileId,
      installment_id: due.installmentId,
      installment_number: due.installmentNumber,
      amount: due.amount,
      method,
      utr,
      paid_on: paidOn,
      proof_url: proofUrl,
      proof_channel: proofChannel,
      payer_name: payerName,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      return { ok: false, status: 409, code: 'UTR_USED', error: 'This reference number or a payment is already waiting for verification.', fieldErrors: { transactionReference: 'Already submitted.' } };
    }
    throw error;
  }
  return { ok: true, claim, due };
}

export type DecideClaimResult =
  | { ok: true; claim: any; paymentId: string | null; balanceAfter: number | null }
  | { ok: false; status: number; error: string };

/** Staff matched the UTR and amount with the bank: record the payment. */
export async function verifyFeePaymentClaim(supabase: any, claimId: string, adminId: string): Promise<DecideClaimResult> {
  // Lock first, so two staff clicking Verify record the money once.
  const { data: claim, error: lockErr } = await supabase
    .from('fee_payment_claims')
    .update({ verified_by: adminId, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', claimId)
    .eq('status', 'pending')
    .is('verified_at', null)
    .select('*')
    .maybeSingle();
  if (lockErr) throw lockErr;
  if (!claim) return { ok: false, status: 409, error: 'This payment was already handled. Refresh.' };

  const key = `fee-claim:${claim.id}`;
  try {
    const recorded = await recordOfficePayment(
      {
        userId: claim.user_id,
        line: {
          key,
          amount: Number(claim.amount),
          paidOn: claim.paid_on,
          method: claim.method,
          reference: claim.utr,
          installmentNumber: claim.installment_number,
        },
        adminId,
      },
      supabase,
    );
    const now = new Date().toISOString();
    const { error: payErr } = await supabase
      .from('payments')
      .update({
        direct_payment_utr: claim.utr,
        direct_payment_screenshot_url: claim.proof_url,
        screenshot_url: claim.proof_url,
        direct_payment_payer_name: claim.payer_name || null,
        screenshot_verified: true,
        verified_by: adminId,
        verified_at: now,
        description: `Balance paid by ${claim.method === 'bank_transfer' ? 'bank transfer' : 'UPI'}, verified against the bank.${claim.utr ? ` UTR ${claim.utr}` : claim.proof_channel === 'whatsapp' ? ' Screenshot on WhatsApp.' : ''}`,
      })
      .eq('idempotency_key', key);
    if (payErr) console.error('[fee-claim] payment proof update failed:', payErr.message);

    const { data: done, error: doneErr } = await supabase
      .from('fee_payment_claims')
      .update({ status: 'verified', payment_id: recorded.payment.id, updated_at: now })
      .eq('id', claim.id)
      .select('*')
      .single();
    if (doneErr) throw doneErr;
    return { ok: true, claim: done, paymentId: recorded.payment.id, balanceAfter: recorded.view.balance };
  } catch (err: any) {
    // Leave it waiting so staff can fix the cause and verify again.
    await supabase.from('fee_payment_claims').update({ verified_by: null, verified_at: null }).eq('id', claim.id).eq('status', 'pending');
    return { ok: false, status: err?.name === 'StudentFeeError' ? 400 : 500, error: err?.message || 'Could not record the payment.' };
  }
}

/** Staff could not find the money: the student is told why and can submit again. */
export async function rejectFeePaymentClaim(supabase: any, claimId: string, reason: string): Promise<DecideClaimResult> {
  const { data: claim, error } = await supabase
    .from('fee_payment_claims')
    .update({ status: 'rejected', rejection_reason: reason, rejected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', claimId)
    .eq('status', 'pending')
    .is('verified_at', null)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!claim) return { ok: false, status: 409, error: 'This payment was already handled. Refresh.' };
  return { ok: true, claim, paymentId: null, balanceAfter: null };
}
