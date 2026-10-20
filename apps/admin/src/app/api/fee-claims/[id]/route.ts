export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, formatDueDate } from '@neram/database';
import { loadBalanceDue, verifyFeePaymentClaim, rejectFeePaymentClaim } from '@neram/database/fee-payment-claims';
import { sendBalanceVerifiedEmail, sendPaymentRejectedEmail } from '@neram/database/enrolment-payment-email';
import { UUID_REGEX, actingAdminId } from '@/lib/fee-request';
import { reviewLegacyClaim } from '@neram/database/payments';
import { linkOrigin } from '@/lib/enrolment-link-server';
import { signedProofUrl } from '@/lib/payment-proof';

async function loadClaim(supabase: any, id: string) {
  const { data, error } = await supabase
    .from('fee_payment_claims')
    .select('*, user:users!fee_payment_claims_user_id_fkey(name, phone, email)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** GET: one balance payment, the student's fee position, and a short-lived screenshot link. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!actingAdminId(request)) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (!UUID_REGEX.test(params.id)) return NextResponse.json({ error: 'Invalid payment.' }, { status: 400 });
  try {
    const supabase = getSupabaseAdminClient() as any;
    const claim = await loadClaim(supabase, params.id);
    if (!claim) return NextResponse.json({ error: 'That payment was not found.' }, { status: 404 });
    const due = await loadBalanceDue(supabase, claim.user_id);
    return NextResponse.json({
      success: true,
      data: {
        id: claim.id,
        userId: claim.user_id,
        status: claim.status,
        studentName: claim.user?.name || due.studentName,
        studentPhone: claim.user?.phone || null,
        studentEmail: claim.user?.email || null,
        amount: Number(claim.amount) || 0,
        method: claim.method,
        utr: claim.utr,
        proofChannel: claim.proof_channel || 'upload',
        payerName: claim.payer_name || null,
        paidOn: claim.paid_on,
        installmentNumber: claim.installment_number,
        submittedAt: claim.created_at,
        rejectionReason: claim.rejection_reason,
        verifiedAt: claim.verified_at,
        proofUrl: await signedProofUrl(supabase, claim.proof_url),
        fee: { agreed: due.agreed, paidTotal: due.paidTotal, balance: due.balance, nextDue: due.amount, dueDate: due.dueDate },
      },
    });
  } catch (error: any) {
    console.error('[fee-claims] get failed:', error?.message);
    return NextResponse.json({ error: 'Could not load that payment.' }, { status: 500 });
  }
}

/**
 * POST { decision: 'verify' | 'reject', reason? }
 * verify: matched with the bank; the payment is recorded in Collections and a receipt emailed.
 * reject: not found; the student is told why and can submit again.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const adminId = actingAdminId(request, body);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (!UUID_REGEX.test(params.id)) return NextResponse.json({ error: 'Invalid payment.' }, { status: 400 });
  const decision = body?.decision;
  if (decision !== 'verify' && decision !== 'reject') {
    return NextResponse.json({ error: 'Choose verify or reject.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient() as any;
    const claim = await loadClaim(supabase, params.id);
    if (!claim) return NextResponse.json({ error: 'That payment was not found.' }, { status: 404 });
    const to: string | null = claim.user?.email || null;
    const name: string = claim.user?.name || 'Student';

    if (decision === 'reject') {
      const reason = String(body?.reason || '').trim().slice(0, 500);
      if (reason.length < 5) {
        return NextResponse.json({ error: 'Say what was wrong, so the student can fix it.', fieldErrors: { reason: 'Enter a reason.' } }, { status: 400 });
      }
      const result = await rejectFeePaymentClaim(supabase, claim.id, reason);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      await reviewLegacyClaim(supabase, { claimId: claim.id, decision: 'reject', staffId: adminId, reason });
      if (to) {
        const sent = await sendPaymentRejectedEmail(to, {
          studentName: name,
          amount: Number(claim.amount),
          utr: claim.utr,
          reason,
          url: `${linkOrigin(request)}/en/pay-balance`,
          purpose: 'balance',
        }).catch((e: any) => ({ success: false, error: e?.message }));
        if (!sent.success) console.error('[fee-claims] rejection email failed:', sent.error);
      }
      return NextResponse.json({ success: true, data: { status: 'rejected', emailedTo: to } });
    }

    if (body?.statementChecked !== true) {
      return NextResponse.json({ error: 'Tick that you found this payment in the bank statement before you verify.', code: 'STATEMENT_REQUIRED' }, { status: 400 });
    }
    const result = await verifyFeePaymentClaim(supabase, claim.id, adminId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    // Payments v2 (Phase 0): the waiting attempt succeeds; its fulfil job finds the ledger row and stamps it.
    await reviewLegacyClaim(supabase, { claimId: claim.id, decision: 'verify', staffId: adminId });

    let receiptNumber: string | null = null;
    if (result.paymentId) {
      const { data: pay } = await supabase.from('payments').select('receipt_number').eq('id', result.paymentId).maybeSingle();
      receiptNumber = pay?.receipt_number || null;
    }
    if (to) {
      const sent = await sendBalanceVerifiedEmail(to, {
        studentName: name,
        amount: Number(claim.amount),
        method: claim.method,
        utr: claim.utr,
        paidOn: formatDueDate(claim.paid_on),
        balanceAfter: result.balanceAfter,
        receiptNumber,
      }).catch((e: any) => ({ success: false, error: e?.message }));
      if (!sent.success) console.error('[fee-claims] receipt email failed:', sent.error);
    }
    return NextResponse.json({
      success: true,
      data: { status: 'verified', receiptNumber, balanceAfter: result.balanceAfter, emailedTo: to },
    });
  } catch (error: any) {
    console.error('[fee-claims] decide failed:', error?.message);
    return NextResponse.json({ error: error?.message || 'Could not update the payment. Try again.' }, { status: 500 });
  }
}
