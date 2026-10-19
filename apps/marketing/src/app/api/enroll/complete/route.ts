// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  getDirectEnrollmentLinkByToken,
  updateUser,
  decideEnrolUser,
  isDisposableAccount,
  mergeUserRecords,
  logDirectEnrollmentLinkEvent,
  istToday,
  isDateKey,
  formatDueDate,
  addDaysToKey,
} from '@neram/database';
import { finaliseDirectEnrolment, type DirectEnrolmentForm } from '@neram/database/direct-enrolment';
import { offerFromLink, amountDueToday, normaliseTransactionRef } from '@neram/database/student-pay';
import { sendPaymentSubmittedEmail, alertStaffPaymentToVerify } from '@neram/database/enrolment-payment-email';
import { isUtrTaken } from '@neram/database/fee-payment-claims';
import { verifyFirebaseToken } from '../../_lib/auth';
import { normalisePhone, isSameMobile } from '@/lib/phone';

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
    if (!phoneVerified) return NextResponse.json({ error: 'Phone verification is required' }, { status: 400 });

    const supabase = createAdminClient();

    const link = await getDirectEnrollmentLinkByToken(token, supabase);
    if (!link || link.status !== 'active' || new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invalid or expired enrollment link' }, { status: 400 });
    }

    const who = await resolveEnrolUser(supabase, link, auth);
    if ('response' in who) return who.response;
    const userId = who.userId;

    const form: DirectEnrolmentForm = {
      firstName,
      fatherName: body.fatherName,
      dateOfBirth: body.dateOfBirth,
      gender: body.gender,
      country: body.country,
      state: body.state,
      city: body.city,
      district: body.district,
      pincode: body.pincode,
      address: body.address,
      applicantCategory,
      academicData: body.academicData,
      casteCategory: body.casteCategory,
      targetExamYear: body.targetExamYear,
      schoolType: body.schoolType,
      parentPhone: body.parentPhone,
      studentPhone: body.studentPhone,
      phoneVerifiedAt: body.phoneVerifiedAt,
    };

    if (link.payment_mode === 'student_pays') {
      return submitStudentPayment({ supabase, link, userId, auth, form, body });
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

/**
 * A link made for a demo person enrols THAT account. Signed in with another
 * account: it is folded into the demo account (the demo account wins) only when
 * it is a shell made by this very sign-in AND it proved the demo person's number
 * by OTP. Holding the link alone is never enough, so nobody's account is merged
 * on a link that leaked.
 */
async function resolveEnrolUser(supabase: any, link: any, auth: any): Promise<{ userId: string } | { response: NextResponse }> {
  if (!link.user_id || link.user_id === auth.userId) return { userId: auth.userId };

  const { data: linkUser, error: linkUserError } = await supabase
    .from('users')
    .select('id, user_type, phone, phone_verified')
    .eq('id', link.user_id)
    .maybeSingle();
  if (linkUserError) throw linkUserError;
  if (linkUser?.user_type === 'student') {
    return { response: NextResponse.json({ error: 'You are already enrolled as a student' }, { status: 400 }) };
  }
  const demoPhone = linkUser?.phone || link.student_phone;
  const provedDemoNumber = Boolean(linkUser) && auth.phoneVerified === true && isSameMobile(auth.phone, demoPhone);
  const { data: signedIn } = await supabase.from('users').select('id, user_type, created_at').eq('id', auth.userId).single();
  const decision = decideEnrolUser({
    linkUserId: link.user_id,
    signedInUserId: auth.userId,
    signedInIsDisposable: provedDemoNumber && signedIn ? await isDisposableAccount(supabase as any, signedIn) : false,
  });
  if (decision.action === 'refuse') {
    const message = link.demo_registration_id
      ? decision.message
      : decision.message.replace('the number you used for your demo', 'the number on your Neram account');
    return { response: NextResponse.json({ error: message, code: 'WRONG_ACCOUNT' }, { status: 409 }) };
  }
  if (decision.action === 'merge') {
    await mergeUserRecords(decision.userId, decision.mergeFrom, null, supabase);
    console.log(`[Direct Enrollment] Merged sign-in account ${decision.mergeFrom} into demo account ${decision.userId}`);
    const proven: Record<string, unknown> = { phone_verified: true };
    if (!linkUser.phone) proven.phone = normalisePhone(auth.phone) || auth.phone;
    await updateUser(decision.userId, proven, supabase);
  }
  return { userId: decision.userId };
}

/** Student-pays: save the claim, tell the student and staff. Enrols nobody. */
async function submitStudentPayment(args: {
  supabase: any;
  link: any;
  userId: string;
  auth: any;
  form: DirectEnrolmentForm;
  body: any;
}) {
  const { supabase, link, userId, auth, form, body } = args;

  const { data: existingUser } = await supabase.from('users').select('user_type, email, name').eq('id', userId).single();
  if (existingUser?.user_type === 'student') {
    return NextResponse.json({ error: 'You are already enrolled as a student' }, { status: 400 });
  }

  const scheme = body.scheme === 'installment' ? 'installment' : body.scheme === 'full' ? 'full' : null;
  const method = body.paymentMethod === 'bank_transfer' ? 'bank_transfer' : body.paymentMethod === 'upi_direct' ? 'upi_direct' : null;
  const offer = offerFromLink(link);
  const amount = scheme ? amountDueToday(offer, scheme) : null;
  const utr = method ? normaliseTransactionRef(body.transactionReference, method) : null;
  const today = istToday();
  const paidOn = isDateKey(body.paymentDate) && body.paymentDate <= today ? body.paymentDate : null;
  const proofUrl = typeof body.paymentProofUrl === 'string' && body.paymentProofUrl.startsWith('http') ? body.paymentProofUrl : null;

  const fieldErrors: Record<string, string> = {};
  if (!scheme || amount === null) fieldErrors.scheme = 'Choose how you want to pay.';
  if (!method) fieldErrors.paymentMethod = 'Choose UPI or bank transfer.';
  if (method && !utr) {
    fieldErrors.transactionReference =
      method === 'upi_direct'
        ? 'The UPI reference (UTR) is the 12-digit number in your payment app.'
        : 'Enter the bank reference (UTR) from your transfer receipt.';
  }
  if (!paidOn) fieldErrors.paymentDate = 'Choose the day you paid (not a future date).';
  if (!proofUrl) fieldErrors.paymentProofUrl = 'Upload the payment screenshot.';
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: 'Check the highlighted fields.', fieldErrors }, { status: 400 });
  }

  // One UTR, one payment: never a reference already on a payment, a balance
  // claim or another enrolment link.
  if (await isUtrTaken(supabase, utr)) {
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

  await logDirectEnrollmentLinkEvent(link.id, 'payment_submitted', null, { amount, scheme, method, utr }, supabase);

  const facts = {
    studentName: form.firstName || link.student_name,
    amount,
    scheme,
    method,
    utr,
    paidOn: formatDueDate(paidOn),
    courseLabel: COURSE_LABELS[link.interest_course] || 'Neram Classes coaching',
    balance: scheme === 'installment' ? offer.installment2 : null,
    balanceDueLabel: balanceDueDate ? formatDueDate(balanceDueDate) : null,
  };

  const to = auth.email || existingUser?.email || link.student_email;
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
      paidOn,
      balance: facts.balance,
      balanceDueDate,
      emailedTo: to || null,
    },
  });
}
