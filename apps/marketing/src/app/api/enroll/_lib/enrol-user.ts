// @ts-nocheck
/**
 * Shared by /api/enroll/complete and /api/payments/intents: who an enrolment
 * link enrols, and the application form as the student typed it.
 */
import { NextResponse } from 'next/server';
import { decideEnrolUser, isDisposableAccount, mergeUserRecords, storedMobile } from '@neram/database';
import type { DirectEnrolmentForm } from '@neram/database/direct-enrolment';
import { normalisePhone, isSameMobile, isSamePhone, maskMobile } from '@/lib/phone';

/**
 * A link made for a demo person enrols THAT account. Signed in with another
 * account: it is folded into the demo account (the demo account wins) when it is
 * a shell made by this very sign-in AND it proved a number by OTP. The number
 * need not be the one on the link: staff may have typed it wrong, or the student
 * has a new SIM. The student changes it themselves; adoptVerifiedNumber keeps the
 * old one in the account history and the demo log for the desk. An established
 * account (applications, payments, older than a day) is never folded in.
 */
export async function resolveEnrolUser(supabase: any, link: any, auth: any): Promise<{ userId: string } | { response: NextResponse }> {
  if (!link.user_id || link.user_id === auth.userId) {
    await adoptVerifiedNumber(supabase, link, auth.userId, auth);
    return { userId: auth.userId };
  }

  const { data: linkUser, error: linkUserError } = await supabase
    .from('users')
    .select('id, user_type, phone, phone_verified')
    .eq('id', link.user_id)
    .maybeSingle();
  if (linkUserError) throw linkUserError;
  if (linkUser?.user_type === 'student') {
    return { response: NextResponse.json({ error: 'You are already enrolled as a student' }, { status: 400 }) };
  }
  const provedANumber = Boolean(linkUser) && auth.phoneVerified === true && Boolean(normalisePhone(auth.phone));
  const { data: signedIn } = await supabase.from('users').select('id, user_type, created_at').eq('id', auth.userId).single();
  const decision = decideEnrolUser({
    linkUserId: link.user_id,
    signedInUserId: auth.userId,
    signedInIsDisposable: provedANumber && signedIn ? await isDisposableAccount(supabase as any, signedIn) : false,
  });
  if (decision.action === 'refuse') {
    return { response: NextResponse.json({ error: wrongAccountMessage(linkUser?.phone || link.student_phone, provedANumber), code: 'WRONG_ACCOUNT' }, { status: 409 }) };
  }
  if (decision.action === 'merge') {
    const demoPhone = linkUser?.phone || link.student_phone;
    await mergeUserRecords(decision.userId, decision.mergeFrom, null, supabase);
    console.log(
      `[Direct Enrollment] Merged sign-in account ${decision.mergeFrom} into demo account ${decision.userId}` +
        (isSameMobile(auth.phone, demoPhone) ? '' : ' on a new number'),
    );
  }
  await adoptVerifiedNumber(supabase, link, decision.userId, auth);
  return { userId: decision.userId };
}

/** Why this account cannot enrol on the link, and what the student can do about it. */
export function wrongAccountMessage(accountPhone: string | null, provedANumber: boolean): string {
  if (!provedANumber) return 'Verify your mobile number with an OTP to continue.';
  const ours = maskMobile(accountPhone);
  return (
    'The number you verified is already on another Neram account, so it cannot be used here. ' +
    `Sign in with ${ours ? `the number we have for you (${ours})` : 'a different number of your own'} to continue.`
  );
}

/**
 * The number the student proved by OTP becomes theirs on the account, the link
 * and the demo. The old one is kept: a user_profile_history row (User 360 >
 * History) and a note in the demo's activity log. Never blocks the enrolment.
 */
export async function adoptVerifiedNumber(supabase: any, link: any, userId: string, auth: any): Promise<void> {
  if (auth.phoneVerified !== true) return;
  const verified = normalisePhone(auth.phone);
  if (!verified) return;
  try {
    const { data: account } = await supabase.from('users').select('phone').eq('id', userId).maybeSingle();
    if (account && !isSamePhone(account.phone, verified)) {
      const { error } = await supabase.from('users').update({ phone: verified, phone_verified: true }).eq('id', userId);
      if (error) throw error;
      await recordPhoneHistory(supabase, userId, account.phone, verified);
    }

    if (!isSamePhone(link.student_phone, verified)) {
      await supabase.from('direct_enrollment_links').update({ student_phone: verified }).eq('id', link.id);
    }

    if (link.demo_registration_id) {
      const { data: demo } = await supabase.from('demo_class_registrations').select('phone').eq('id', link.demo_registration_id).maybeSingle();
      if (demo && !isSamePhone(demo.phone, verified)) {
        await supabase.from('demo_class_registrations').update({ phone: storedMobile(verified) ?? verified }).eq('id', link.demo_registration_id);
        await supabase.from('demo_request_events').insert({
          registration_id: link.demo_registration_id,
          kind: 'note',
          outcome: 'phone_changed',
          note: `The student changed their mobile on the enrolment link from ${normalisePhone(demo.phone) || demo.phone || 'none'} to ${verified}, verified by OTP.`,
          actor_id: null,
        });
      }
    }
  } catch (error) {
    console.error('[Direct Enrollment] Could not record the new number:', error);
  }
}

/** The account's old number, kept where User 360 shows profile history. */
export async function recordPhoneHistory(supabase: any, userId: string, oldPhone: string | null, newPhone: string): Promise<void> {
  await supabase.from('user_profile_history').insert({
    user_id: userId,
    field_name: 'phone',
    old_value: oldPhone != null ? JSON.stringify(oldPhone) : null,
    new_value: JSON.stringify(newPhone),
    change_source: 'user',
  });
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
