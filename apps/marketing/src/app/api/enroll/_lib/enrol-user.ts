// @ts-nocheck
/**
 * Shared by /api/enroll/complete and /api/payments/intents: who an enrolment
 * link enrols, and the application form as the student typed it.
 */
import { NextResponse } from 'next/server';
import { updateUser, decideEnrolUser, isDisposableAccount, mergeUserRecords } from '@neram/database';
import type { DirectEnrolmentForm } from '@neram/database/direct-enrolment';
import { normalisePhone, isSameMobile } from '@/lib/phone';

/**
 * A link made for a demo person enrols THAT account. Signed in with another
 * account: it is folded into the demo account (the demo account wins) only when
 * it is a shell made by this very sign-in AND it proved the demo person's number
 * by OTP. Holding the link alone is never enough, so nobody's account is merged
 * on a link that leaked.
 */
export async function resolveEnrolUser(supabase: any, link: any, auth: any): Promise<{ userId: string } | { response: NextResponse }> {
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

/** The application answers, as the enrol form posts them. */
export function formFromBody(body: any): DirectEnrolmentForm {
  return {
    firstName: body.firstName,
    fatherName: body.fatherName,
    dateOfBirth: body.dateOfBirth,
    gender: body.gender,
    country: body.country,
    state: body.state,
    city: body.city,
    district: body.district,
    pincode: body.pincode,
    address: body.address,
    applicantCategory: body.applicantCategory,
    academicData: body.academicData,
    casteCategory: body.casteCategory,
    targetExamYear: body.targetExamYear,
    schoolType: body.schoolType,
    parentPhone: body.parentPhone,
    studentPhone: body.studentPhone,
    phoneVerifiedAt: body.phoneVerifiedAt,
  };
}
