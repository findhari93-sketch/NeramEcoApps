// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  getDirectEnrollmentLinkByToken,
  logDirectEnrollmentLinkEvent,
  istToday,
  isDateKey,
  formatDueDate,
  addDaysToKey,
} from '@neram/database';
import { finaliseDirectEnrolment, type DirectEnrolmentForm } from '@neram/database/direct-enrolment';
import { offerFromLink, amountDueToday, normaliseTransactionRef, offerLines } from '@neram/database/student-pay';
import { enrolmentLinkUrl } from '@neram/database/enrolment-link';
import { getPaymentPayee } from '@neram/database/payment-payee';
import { sendPaymentSubmittedEmail, sendPaymentSavedEmail, alertStaffPaymentToVerify } from '@neram/database/enrolment-payment-email';
import { isUtrTaken } from '@neram/database/fee-payment-claims';
import { recordLegacyProofSubmission } from '@neram/database/payments';
import { verifyFirebaseToken } from '../../_lib/auth';
import { resolveEnrolUser, formFromBody } from '../_lib/enrol-user';

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA coaching',
  jee_paper2: 'JEE Paper 2 coaching',
  both: 'NATA + JEE Paper 2 coaching',
};

/**
 * POST /api/enroll/complete (Firebase auth required)
 *
 * 'recorded' links (staff already received the money): the student is enrolled now.
 * 'student_pays' links: the student's UTR + screenshot is saved as a CLAIM and the
 * link becomes 'payment_submitted'. Nothing is enrolled until staff verify it in
 * Admin against the bank. The amount is always read from the link, never the body.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required. Please sign in with Google.' }, { status: 401 });
    }

    const body = await request.json();
    const { token, firstName, applicantCategory, phoneVerified } = body;

    if (!token) return NextResponse.json({ error: 'Enrollment token is required' }, { status: 400 });
    if (!firstName || !applicantCategory) {
      return NextResponse.json({ error: 'First name and applicant category are required' }, { status: 400 });
    }
    // The account's OTP-verified phone, never the browser's say-so: a script
    // sending phoneVerified: true used to skip the OTP. (body.phoneVerified is
    // still required, so an old wizard that forgot to verify fails the same way.)
    if (!phoneVerified || !auth.phoneVerified) {
      return NextResponse.json({ error: 'Phone verification is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const link = await getDirectEnrollmentLinkByToken(token, supabase);
    if (!link || link.status !== 'active' || new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invalid or expired enrollment link' }, { status: 400 });
    }

    const who = await resolveEnrolUser(supabase, link, auth);
    if ('response' in who) return who.response;
    const userId = who.userId;

    const form: DirectEnrolmentForm = formFromBody(body);

    if (link.payment_mode === 'student_pays') {
      return submitStudentPayment({ supabase, link, userId, auth, form, body, request });
    }

    const { data: existingUser } = await supabase.from('users').select('user_type').eq('id', userId).single();
    if (existingUser?.user_type === 'student') {
      return NextResponse.json({ error: 'You are already enrolled as a student' }, { status: 400 });
    }

    const result = await finaliseDirectEnrolment(supabase, {
      link,
      userId,
      form,
      authPhone: auth.phone,
      payment: {
        method: body.paymentMethod,
        date: body.paymentDate,
        reference: body.transactionReference,
        proofUrl: body.paymentProofUrl,
      },
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, details: result.details }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      data: {
        applicationNumber: result.applicationNumber,
        studentId: result.applicationNumber,
        studentProfileId: result.studentProfileId,
        message: 'Enrollment completed successfully! Welcome to Neram Classes.',
      },
    });
  } catch (error) {
    console.error('Error completing direct enrollment:', error);
    return NextResponse.json({ error: 'Failed to complete enrollment. Please try again.' }, { status: 500 });
  }
}

/** The site's own origin for links in emails (the request's host locally). */
function siteOrigin(request: NextRequest): string {
  const origin = new URL(request.url).origin;
  if (/localhost|127\.0\.0\.1/.test(origin)) return origin;
  return (process.env.NEXT_PUBLIC_SITE_URL || origin).replace(/\/+$/, '');
}

/**
 * Student-pays: save the claim (or, for "pay later", just the details), tell
 * the student and staff. Enrols nobody. Proof is a screenshot on the page OR
 * "sent on WhatsApp"; the UTR is optional but must look real when given.
 */
async function submitStudentPayment(args: {
  supabase: any;
  link: any;
  userId: string;
  auth: any;
  form: DirectEnrolmentForm;
  body: any;
  request: NextRequest;
}) {
  const { supabase, link, userId, auth, form, body, request } = args;

  const { data: existingUser } = await supabase.from('users').select('user_type, email, name').eq('id', userId).single();
  if (existingUser?.user_type === 'student') {
    return NextResponse.json({ error: 'You are already enrolled as a student' }, { status: 400 });
  }

  const scheme = body.scheme === 'installment' ? 'installment' : body.scheme === 'full' ? 'full' : null;
  const offer = offerFromLink(link);
  const amount = scheme ? amountDueToday(offer, scheme) : null;
  const to = auth.email || existingUser?.email || link.student_email || null;
  const studentName = form.firstName || link.student_name;
  const courseLabel = COURSE_LABELS[link.interest_course] || 'Neram Classes coaching';

  // ── Pay later: keep the details, keep the link open, email how to pay ──────
  if (body.intent === 'pay_later') {
    const { data: saved, error: saveErr } = await supabase
      .from('direct_enrollment_links')
      .update({
        details_saved_at: new Date().toISOString(),
        submitted_form: form,
        submitted_user_id: userId,
        chosen_scheme: scheme && amount !== null ? scheme : link.chosen_scheme || null,
        parent_phone: form.parentPhone || link.parent_phone || null,
      })
      .eq('id', link.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();
    if (saveErr) throw saveErr;
    if (!saved) return NextResponse.json({ error: 'This link was already used. Refresh the page.', code: 'NOT_ACTIVE' }, { status: 409 });

    await logDirectEnrollmentLinkEvent(link.id, 'details_saved', null, { scheme }, supabase);
    if (to) {
      const origin = siteOrigin(request);
      const payee = await getPaymentPayee(supabase);
      const planScheme = scheme && amount !== null ? scheme : 'full';
      const sent = await sendPaymentSavedEmail(to, {
        studentName,
        courseLabel,
        offerLines: offerLines(offer, formatDueDate(addDaysToKey(istToday(), link.offer_balance_due_days || 45))),
        payee,
        resumeUrl: enrolmentLinkUrl(link.token, origin),
        qrPngUrl: `${origin}/api/enroll/qr?token=${encodeURIComponent(link.token)}&scheme=${planScheme}`,
        expiresLabel: formatDueDate(String(link.expires_at).slice(0, 10)),
      }).catch((e: any) => ({ success: false, error: e?.message }));
      if (!sent.success) console.error('[enroll/complete] saved email failed:', sent.error);
    }
    return NextResponse.json({ success: true, data: { status: 'details_saved', emailedTo: to } });
  }

  // ── A payment claim ────────────────────────────────────────────────────────
  const method = body.paymentMethod === 'bank_transfer' ? 'bank_transfer' : body.paymentMethod === 'upi_direct' ? 'upi_direct' : null;
  const rawUtr = typeof body.transactionReference === 'string' ? body.transactionReference.trim() : '';
  const utr = rawUtr && method ? normaliseTransactionRef(rawUtr, method) : null;
  const today = istToday();
  const paidOn = isDateKey(body.paymentDate) && body.paymentDate <= today ? body.paymentDate : null;
  const proofUrl = typeof body.paymentProofUrl === 'string' && body.paymentProofUrl.startsWith('http') ? body.paymentProofUrl : null;
  const proofChannel: 'upload' | 'whatsapp' = body.proofChannel === 'whatsapp' ? 'whatsapp' : 'upload';
  const whatsappSent = body.whatsappSent === true;
  const payerName = typeof body.payerName === 'string' ? body.payerName.trim().slice(0, 80) || null : null;

  const fieldErrors: Record<string, string> = {};
  if (!scheme || amount === null) fieldErrors.scheme = 'Choose how you want to pay.';
  if (!method) fieldErrors.paymentMethod = 'Choose UPI or bank transfer.';
  if (rawUtr && method && !utr) {
    fieldErrors.transactionReference =
      method === 'upi_direct'
        ? 'A UPI reference (UTR) is 12 digits. Leave it empty if you cannot find it.'
        : 'A bank reference is 12 to 22 letters and digits. Leave it empty if you cannot find it.';
  }
  if (!paidOn) fieldErrors.paymentDate = 'Choose the day you paid (not a future date).';
  if (proofChannel === 'upload' && !proofUrl) fieldErrors.paymentProofUrl = 'Upload the payment screenshot, or choose "I sent it on WhatsApp".';
  if (proofChannel === 'whatsapp') {
    const payee = await getPaymentPayee(supabase);
    if (!payee.whatsappNumber) fieldErrors.proofChannel = 'Sending on WhatsApp is not available right now. Upload the screenshot instead.';
    else if (!whatsappSent) fieldErrors.whatsappSent = 'Tick the box once you have sent the screenshot on WhatsApp.';
  }
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: 'Check the highlighted fields.', fieldErrors }, { status: 400 });
  }

  // One UTR, one payment: never a reference already on a payment, a balance
  // claim or another enrolment link.
  if (utr && (await isUtrTaken(supabase, utr))) {
    return NextResponse.json(
      { error: 'This reference number was already used for another payment. Check the number in your payment app.', code: 'UTR_USED', fieldErrors: { transactionReference: 'Already used for another payment.' } },
      { status: 409 },
    );
  }

  const balanceDueDate = scheme === 'installment' ? addDaysToKey(paidOn, link.offer_balance_due_days || 45) : null;
  const { data: updated, error: updateError } = await supabase
    .from('direct_enrollment_links')
    .update({
      status: 'payment_submitted',
      chosen_scheme: scheme,
      submitted_amount: amount,
      submitted_utr: utr,
      submitted_method: method,
      submitted_paid_on: paidOn,
      submitted_proof_url: proofUrl,
      submitted_proof_channel: proofChannel,
      submitted_payer_name: payerName,
      submitted_form: form,
      submitted_user_id: userId,
      submitted_at: new Date().toISOString(),
      rejection_reason: null,
      rejected_at: null,
      // What the office plan will be once verified.
      payment_scheme: scheme,
      installment_2_amount: scheme === 'installment' ? offer.installment2 : null,
      installment_2_due_date: balanceDueDate,
      parent_phone: form.parentPhone || link.parent_phone || null,
    })
    .eq('id', link.id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();

  if (updateError) {
    if (updateError.code === '23505') {
      return NextResponse.json(
        { error: 'This reference number was already submitted. Check the number in your payment app.', code: 'UTR_USED', fieldErrors: { transactionReference: 'Already submitted.' } },
        { status: 409 },
      );
    }
    throw updateError;
  }
  if (!updated) {
    return NextResponse.json({ error: 'This link was already used. Refresh the page.', code: 'NOT_ACTIVE' }, { status: 409 });
  }

  await logDirectEnrollmentLinkEvent(link.id, 'payment_submitted', null, { amount, scheme, method, utr, proofChannel }, supabase);
  // Payments v2 (Phase 0): the same submission as an intent + awaiting_review
  // attempt, so the audit trail and the outbox exist. The link stays the source
  // of truth until the read model moves; the bridge never throws.
  await recordLegacyProofSubmission(supabase, { link, userId, scheme: scheme as 'full' | 'installment', method: method as 'upi_direct' | 'bank_transfer', utr, paidOn, proofUrl, proofChannel, payerName });

  const facts = {
    studentName,
    amount: amount as number,
    scheme: scheme as 'full' | 'installment',
    method: method as 'upi_direct' | 'bank_transfer',
    utr,
    proofChannel,
    payerName,
    paidOn: formatDueDate(paidOn),
    courseLabel,
    balance: scheme === 'installment' ? offer.installment2 : null,
    balanceDueLabel: balanceDueDate ? formatDueDate(balanceDueDate) : null,
  };

  if (to) {
    const sent = await sendPaymentSubmittedEmail(to, facts).catch((e) => ({ success: false, error: e?.message }));
    if (!sent.success) console.error('[enroll/complete] submitted email failed:', sent.error);
  }
  await alertStaffPaymentToVerify(supabase, {
    ...facts,
    linkId: link.id,
    phone: form.studentPhone || link.student_phone,
    demoRegistrationId: link.demo_registration_id || null,
    userId,
  }).catch((e) => console.error('[enroll/complete] staff alert failed:', e?.message));

  return NextResponse.json({
    success: true,
    data: {
      status: 'payment_submitted',
      amount,
      scheme,
      method,
      utr,
      proofChannel,
      paidOn,
      balance: facts.balance,
      balanceDueDate,
      emailedTo: to || null,
    },
  });
}
