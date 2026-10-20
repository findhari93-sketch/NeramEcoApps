export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, formatDueDate } from '@neram/database';
import { loadBalanceDue, submitFeePaymentClaim } from '@neram/database/fee-payment-claims';
import { getPaymentPayee, getPaymentQrCodes } from '@neram/database/payment-payee';
import { recordLegacyBalanceClaim } from '@neram/database/payments';
import { sendPaymentSubmittedEmail, alertStaffPaymentToVerify } from '@neram/database/enrolment-payment-email';
import { verifyFirebaseToken } from '../_lib/auth';

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA coaching',
  jee_paper2: 'JEE Paper 2 coaching',
  both: 'NATA + JEE Paper 2 coaching',
};

/** "NRM 9C41B2": the note on the payment, from the student's own id. */
const noteFor = (userId: string) => `NRM ${userId.replace(/-/g, '').slice(-6).toUpperCase()}`;

function claimView(c: any) {
  return {
    id: c.id,
    status: c.status,
    amount: Number(c.amount) || 0,
    method: c.method,
    utrTail: c.utr ? String(c.utr).slice(-4) : null,
    proofChannel: c.proof_channel || 'upload',
    paidOn: c.paid_on,
    submittedAt: c.created_at,
    rejectionReason: c.rejection_reason || null,
  };
}

/**
 * GET /api/pay-balance (Firebase auth): what the signed-in student owes next,
 * where to pay, and any payment of theirs waiting for staff.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  try {
    const supabase = createAdminClient();
    const [due, payee, qrCodes, claimsRes] = await Promise.all([
      loadBalanceDue(supabase, auth.userId),
      getPaymentPayee(supabase),
      getPaymentQrCodes(supabase),
      (supabase as any)
        .from('fee_payment_claims')
        .select('*')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    if (claimsRes.error) throw claimsRes.error;
    const latest = claimsRes.data?.[0] || null;

    return NextResponse.json({
      success: true,
      data: {
        studentName: due.studentName,
        isStudent: due.isStudent,
        due: {
          amount: due.amount,
          installmentNumber: due.installmentNumber,
          dueDate: due.dueDate,
          agreed: due.agreed,
          paidTotal: due.paidTotal,
          balance: due.balance,
        },
        payee,
        qrCodes,
        paymentNote: noteFor(auth.userId),
        pending: latest?.status === 'pending' ? claimView(latest) : null,
        lastRejection: latest?.status === 'rejected' ? claimView(latest) : null,
      },
    });
  } catch (error: any) {
    console.error('[pay-balance] GET failed:', error?.message);
    return NextResponse.json({ error: 'Could not load your fee. Try again.' }, { status: 500 });
  }
}

/**
 * POST /api/pay-balance (Firebase auth): the student paid the trust and sends
 * the reference. A claim for staff to verify; the amount is the fee plan's.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const supabase = createAdminClient();
    const payee = await getPaymentPayee(supabase);
    const result = await submitFeePaymentClaim(supabase, {
      whatsappAllowed: Boolean(payee.whatsappNumber),
      userId: auth.userId,
      method: body.paymentMethod,
      transactionReference: body.transactionReference,
      paymentDate: body.paymentDate,
      paymentProofUrl: body.paymentProofUrl,
      proofChannel: body.proofChannel,
      whatsappSent: body.whatsappSent,
      payerName: body.payerName,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code, fieldErrors: result.fieldErrors }, { status: result.status });
    }

    const { claim, due } = result;
    // Payments v2 (Phase 0): the claim as an intent + awaiting_review attempt too. Never throws.
    await recordLegacyBalanceClaim(supabase, { claim, userId: auth.userId });
    const { data: lead } = due.leadProfileId
      ? await (supabase as any).from('lead_profiles').select('interest_course').eq('id', due.leadProfileId).maybeSingle()
      : { data: null };
    const facts = {
      studentName: due.studentName || 'Student',
      amount: Number(claim.amount),
      scheme: 'installment' as const,
      method: claim.method,
      utr: claim.utr || null,
      proofChannel: claim.proof_channel || 'upload',
      payerName: claim.payer_name || null,
      paidOn: formatDueDate(claim.paid_on),
      courseLabel: COURSE_LABELS[lead?.interest_course] || 'Neram Classes coaching',
      purpose: 'balance' as const,
    };

    const { data: user } = await (supabase as any).from('users').select('email, phone').eq('id', auth.userId).maybeSingle();
    const to = auth.email || user?.email || null;
    if (to) {
      const sent = await sendPaymentSubmittedEmail(to, facts).catch((e: any) => ({ success: false, error: e?.message }));
      if (!sent.success) console.error('[pay-balance] submitted email failed:', sent.error);
    }
    await alertStaffPaymentToVerify(supabase as any, {
      ...facts,
      claimId: claim.id,
      phone: user?.phone || auth.phone || null,
      userId: auth.userId,
    }).catch((e: any) => console.error('[pay-balance] staff alert failed:', e?.message));

    return NextResponse.json({
      success: true,
      data: { pending: claimView(claim), utr: claim.utr, emailedTo: to },
    });
  } catch (error: any) {
    console.error('[pay-balance] POST failed:', error?.message);
    return NextResponse.json({ error: 'Could not send your payment details. Try again.' }, { status: 500 });
  }
}
