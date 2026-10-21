// @ts-nocheck
export const dynamic = 'force-dynamic';
// Verify can also create the class account: several Graph calls after the enrolment.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getDirectEnrollmentLinkById,
  logDirectEnrollmentLinkEvent,
  formatDueDate,
} from '@neram/database';
import { finaliseDirectEnrolment } from '@neram/database/direct-enrolment';
import { offerFromLink } from '@neram/database/student-pay';
import { enrolmentLinkUrl } from '@neram/database/enrolment-link';
import { sendPaymentVerifiedEmail, sendPaymentRejectedEmail } from '@neram/database/enrolment-payment-email';
import { UUID_REGEX, actingAdminId } from '@/lib/fee-request';
import { linkOrigin } from '@/lib/enrolment-link-server';
import { signedProofUrl } from '@/lib/payment-proof';
import { reviewLegacyLink } from '@neram/database/payments';
import { provisionClassAccount } from '@neram/auth/student-accounts';
import { createClassAccountPorts } from '@/lib/class-account-store';

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA coaching',
  jee_paper2: 'JEE Paper 2 coaching',
  both: 'NATA + JEE Paper 2 coaching',
};

function claimView(link: any) {
  const offer = offerFromLink(link);
  return {
    linkId: link.id,
    status: link.status,
    userId: link.submitted_user_id || null,
    studentName: link.submitted_form?.firstName || link.student_name,
    studentPhone: link.submitted_form?.studentPhone || link.student_phone,
    scheme: link.chosen_scheme,
    amount: Number(link.submitted_amount) || 0,
    method: link.submitted_method,
    utr: link.submitted_utr,
    proofChannel: link.submitted_proof_channel || 'upload',
    payerName: link.submitted_payer_name || null,
    paidOn: link.submitted_paid_on,
    submittedAt: link.submitted_at,
    balance: link.chosen_scheme === 'installment' ? offer.installment2 : null,
    balanceDueDate: link.installment_2_due_date,
    offer,
    rejectionReason: link.rejection_reason,
    verifiedAt: link.verified_at,
  };
}

/** GET: the claim staff are checking, with a short-lived link to the screenshot. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!actingAdminId(request)) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (!UUID_REGEX.test(params.id)) return NextResponse.json({ error: 'Invalid link.' }, { status: 400 });
  const supabase = getSupabaseAdminClient();
  const link = await getDirectEnrollmentLinkById(params.id, supabase);
  if (!link) return NextResponse.json({ error: 'That link was not found.' }, { status: 404 });
  return NextResponse.json({
    success: true,
    data: { ...claimView(link), proofUrl: await signedProofUrl(supabase, link.submitted_proof_url) },
  });
}

/**
 * POST { decision: 'verify' | 'reject', reason? }
 * verify: staff matched the UTR and amount with the bank; the student is enrolled.
 * reject: the payment was not found; the link opens again and the UTR is freed.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const adminId = actingAdminId(request, body);
    if (!adminId) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
    if (!UUID_REGEX.test(params.id)) return NextResponse.json({ error: 'Invalid link.' }, { status: 400 });

    const decision = body?.decision;
    if (decision !== 'verify' && decision !== 'reject') {
      return NextResponse.json({ error: 'Choose verify or reject.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const link = await getDirectEnrollmentLinkById(params.id, supabase);
    if (!link) return NextResponse.json({ error: 'That link was not found.' }, { status: 404 });
    if (link.payment_mode !== 'student_pays' || link.status !== 'payment_submitted') {
      return NextResponse.json(
        { error: link.status === 'used' ? 'This payment was already verified.' : 'There is no payment waiting on this link.' },
        { status: 409 },
      );
    }

    const studentEmail = await (async () => {
      if (link.submitted_user_id) {
        const { data } = await supabase.from('users').select('email').eq('id', link.submitted_user_id).maybeSingle();
        if (data?.email) return data.email as string;
      }
      return link.student_email || null;
    })();
    const offer = offerFromLink(link);
    const amount = Number(link.submitted_amount) || 0;

    // ── Reject ───────────────────────────────────────────────────────────────
    if (decision === 'reject') {
      const reason = String(body?.reason || '').trim().slice(0, 500);
      if (reason.length < 5) {
        return NextResponse.json({ error: 'Say what was wrong, so the student can fix it.', fieldErrors: { reason: 'Enter a reason.' } }, { status: 400 });
      }
      const { data: reopened, error } = await supabase
        .from('direct_enrollment_links')
        .update({
          status: 'active',
          rejection_reason: reason,
          rejected_at: new Date().toISOString(),
          // Frees the UTR for a corrected resubmission.
          submitted_utr: null,
          submitted_at: null,
          // A fresh week to pay again.
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', link.id)
        .eq('status', 'payment_submitted')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!reopened) return NextResponse.json({ error: 'Someone else already handled this payment. Refresh.' }, { status: 409 });

      await logDirectEnrollmentLinkEvent(link.id, 'payment_rejected', adminId, { reason, utr: link.submitted_utr, amount }, supabase);
      if (studentEmail) {
        const sent = await sendPaymentRejectedEmail(studentEmail, {
          studentName: link.submitted_form?.firstName || link.student_name,
          amount,
          utr: link.submitted_utr || '',
          reason,
          url: enrolmentLinkUrl(link.token, linkOrigin(request)),
        }).catch((e) => ({ success: false, error: e?.message }));
        if (!sent.success) console.error('[verify-payment] rejection email failed:', sent.error);
      }
      // Payments v2 (Phase 0): the waiting attempt is rejected too. Never throws.
      await reviewLegacyLink(supabase, { linkId: link.id, decision: 'reject', staffId: adminId, reason });
      return NextResponse.json({ success: true, data: { status: 'active', emailedTo: studentEmail } });
    }

    // ── Verify ───────────────────────────────────────────────────────────────
    // Screenshots are easy to fake: staff must say they found it in the bank statement.
    if (body?.statementChecked !== true) {
      return NextResponse.json({ error: 'Tick that you found this payment in the bank statement before you verify.', code: 'STATEMENT_REQUIRED' }, { status: 400 });
    }
    if (!link.submitted_user_id || !link.submitted_form) {
      return NextResponse.json({ error: 'This submission is missing the student details. Ask them to submit again.' }, { status: 409 });
    }

    // Claim it first, so two staff clicking Verify enrol the student once.
    const { data: claimed, error: claimErr } = await supabase
      .from('direct_enrollment_links')
      .update({ verified_by: adminId, verified_at: new Date().toISOString() })
      .eq('id', link.id)
      .eq('status', 'payment_submitted')
      .is('verified_at', null)
      .select('id')
      .maybeSingle();
    if (claimErr) throw claimErr;
    if (!claimed) return NextResponse.json({ error: 'Someone else is verifying this payment. Refresh in a moment.' }, { status: 409 });

    // The agreed money, in the shape every enrolment link carries.
    const isInstallment = link.chosen_scheme === 'installment';
    const money = isInstallment
      ? {
          payment_scheme: 'installment',
          total_fee: offer.listFee,
          discount_amount: offer.extraDiscount,
          final_fee: offer.installmentTotal,
          amount_paid: amount,
          installment_2_amount: offer.installment2,
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
    const { error: moneyErr } = await supabase
      .from('direct_enrollment_links')
      .update({ ...money, payment_method: link.submitted_method, transaction_reference: link.submitted_utr, payment_date: link.submitted_paid_on, payment_proof_url: link.submitted_proof_url })
      .eq('id', link.id);
    if (moneyErr) {
      await supabase.from('direct_enrollment_links').update({ verified_by: null, verified_at: null }).eq('id', link.id);
      throw moneyErr;
    }

    const result = await finaliseDirectEnrolment(supabase, {
      link: { ...link, ...money },
      userId: link.submitted_user_id,
      form: link.submitted_form,
      payment: {
        method: link.submitted_method,
        date: link.submitted_paid_on,
        reference: link.submitted_utr,
        proofUrl: link.submitted_proof_url,
        utr: link.submitted_utr,
      },
      verifiedBy: adminId,
    });

    if (!result.ok) {
      // Leave it waiting, so staff can fix the cause and verify again.
      await supabase.from('direct_enrollment_links').update({ verified_by: null, verified_at: null }).eq('id', link.id).eq('status', 'payment_submitted');
      return NextResponse.json({ error: result.error, details: result.details }, { status: result.status });
    }

    await logDirectEnrollmentLinkEvent(link.id, 'payment_verified', adminId, { amount, utr: link.submitted_utr, scheme: link.chosen_scheme }, supabase);
    // Payments v2 (Phase 0): the waiting attempt succeeds; its fulfil job finds the link used and only stamps the ledger.
    await reviewLegacyLink(supabase, { linkId: link.id, decision: 'verify', staffId: adminId });

    if (studentEmail) {
      const sent = await sendPaymentVerifiedEmail(studentEmail, {
        studentName: link.submitted_form?.firstName || link.student_name,
        amount,
        scheme: isInstallment ? 'installment' : 'full',
        method: link.submitted_method,
        utr: link.submitted_utr || '',
        paidOn: link.submitted_paid_on ? formatDueDate(link.submitted_paid_on) : '',
        courseLabel: COURSE_LABELS[link.interest_course] || 'Neram Classes coaching',
        balance: isInstallment ? offer.installment2 : null,
        balanceDueLabel: isInstallment && link.installment_2_due_date ? formatDueDate(link.installment_2_due_date) : null,
        applicationNumber: result.applicationNumber,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com',
        payBalanceUrl: `${linkOrigin(request)}/en/pay-balance`,
      }).catch((e) => ({ success: false, error: e?.message }));
      if (!sent.success) console.error('[verify-payment] confirmation email failed:', sent.error);
    }

    // The class account, when staff left "Create Microsoft account" ticked. Never undoes the
    // enrolment: a failed step shows on the Class account card with Retry.
    let classAccount: { ok: boolean; upn?: string; complete?: boolean; error?: string; password?: string | null } | null = null;
    if (body?.classAccount?.create === true) {
      try {
        const provisioned = await provisionClassAccount(createClassAccountPorts(supabase, adminId), {
          userId: link.submitted_user_id,
          username: typeof body.classAccount.username === 'string' ? body.classAccount.username : null,
          actorId: adminId,
        });
        classAccount =
          provisioned.kind === 'ok'
            ? { ok: true, upn: provisioned.setup.upn, complete: provisioned.complete, password: provisioned.password }
            : {
                ok: false,
                error:
                  provisioned.kind === 'graph_failed'
                    ? `${provisioned.error.message}${provisioned.error.fix ? ` ${provisioned.error.fix}` : ''}`
                    : provisioned.error,
              };
      } catch (e: any) {
        console.error('[verify-payment] class account failed:', e?.message);
        classAccount = { ok: false, error: e?.message || 'Could not create the class account.' };
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: { status: 'used', applicationNumber: result.applicationNumber, emailedTo: studentEmail, classAccount },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: any) {
    console.error('[verify-payment] failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not update the payment. Try again.' }, { status: 500 });
  }
}
