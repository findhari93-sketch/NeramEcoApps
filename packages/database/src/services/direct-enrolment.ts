/**
 * Turning an enrolment link into an enrolled student. One code path for both
 * kinds of link:
 *  - 'recorded': staff already received the money; Marketing's /api/enroll/complete
 *    finalises the moment the student submits the form.
 *  - 'student_pays': the student paid the trust and submitted a UTR; Admin's
 *    verify-payment route finalises only after staff matched it to the bank.
 *
 * The link row carries the agreed money (total_fee / discount_amount / final_fee /
 * amount_paid / payment_scheme / installment_2_*). Callers resolve WHO is being
 * enrolled (account checks, merges) before calling this.
 */
import { createStudentProfile, updateUser } from '../queries/users';
import { updateDirectEnrollmentLink } from '../queries/direct-enrollment';
import { incrementBatchEnrollment } from '../queries/courses';
import { initializeStudentOnboarding } from '../queries/post-enrollment-onboarding';
import { enrollUserInDefaultClassroom } from '../queries/nexus/classrooms';
import { addUserPhoneContact } from '../queries/user-contacts';
import { resolveDuplicatesFor } from '../queries/duplicates';
import { closeDemoFollowUpsOnEnrol } from '../queries/demo-follow-ups';
import { saveStudentApplicationAndFees } from '../queries/office-fees';
import { notifyNewApplication } from './notifications';
import { parseExamYearAnswer } from '../utils/academic-year';
import { istToday, istDateOf, isOfficePaymentMethod } from '../utils/fee-plan';
import { defaultBalanceDueDate } from '../utils/enrolment-link';
import { buildLeadProfileUpdate } from '../utils/enrol-lead-update';
import { normalisePhoneE164 } from '../utils/phone';

/** The application answers the student typed on the link. */
export interface DirectEnrolmentForm {
  firstName: string;
  fatherName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  district?: string | null;
  pincode?: string | null;
  address?: string | null;
  applicantCategory: string;
  academicData?: Record<string, unknown> | null;
  casteCategory?: string | null;
  targetExamYear?: string | number | null;
  schoolType?: string | null;
  parentPhone?: string | null;
  /** The student's own number, verified by OTP. */
  studentPhone?: string | null;
  phoneVerifiedAt?: string | null;
}

/** How the money arrived. Falls back to what staff put on the link. */
export interface DirectEnrolmentPayment {
  method?: string | null;
  date?: string | null;
  reference?: string | null;
  proofUrl?: string | null;
  /** A UPI/IMPS UTR, saved on payments.direct_payment_utr. */
  utr?: string | null;
}

export interface FinaliseDirectEnrolmentInput {
  link: any;
  userId: string;
  form: DirectEnrolmentForm;
  payment?: DirectEnrolmentPayment;
  /** The phone on the caller's verified token, a last resort for users.phone. */
  authPhone?: string | null;
  /** Staff who matched the payment to the bank (student-pays links). */
  verifiedBy?: string | null;
}

export type FinaliseDirectEnrolmentResult =
  | { ok: true; applicationNumber: string; studentProfileId: string; leadProfileId: string | null; paymentKey: string }
  | { ok: false; status: number; error: string; details?: string };

const sameMobile = (a: unknown, b: unknown) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ta = a.replace(/\D/g, '').slice(-10);
  return ta.length === 10 && ta === b.replace(/\D/g, '').slice(-10);
};

export async function finaliseDirectEnrolment(
  supabase: any,
  input: FinaliseDirectEnrolmentInput,
): Promise<FinaliseDirectEnrolmentResult> {
  const { link, userId, form } = input;
  const pay = input.payment || {};

  const { data: existingUser } = await supabase.from('users').select('id, user_type, phone').eq('id', userId).single();
  if (existingUser?.user_type === 'student') {
    return { ok: false, status: 400, error: 'You are already enrolled as a student' };
  }

  // 1. The user becomes a student.
  const userUpdate: Record<string, unknown> = {
    first_name: form.firstName,
    name: form.firstName,
    user_type: 'student',
    status: 'active',
    phone_verified: true,
    onboarding_completed: true, // Direct enrolment skips the quiz wizard (data already collected)
    date_of_birth: form.dateOfBirth || null,
    gender: form.gender || null,
  };
  // Google sign-ins have users.phone NULL; the Entra reconciler matches on it,
  // so an empty phone here becomes a duplicate student later (Chetana, 2026-07-28).
  if (!existingUser?.phone) {
    const resolvedPhone =
      normalisePhoneE164(form.studentPhone) || normalisePhoneE164(input.authPhone) || normalisePhoneE164(link.student_phone);
    if (resolvedPhone) userUpdate.phone = resolvedPhone;
  }
  await updateUser(userId, userUpdate as any, supabase);

  // 2. Student profile (its DB-generated student_id is the application number).
  let studentProfile: any;
  try {
    studentProfile = await createStudentProfile(
      {
        user_id: userId,
        enrollment_date: new Date().toISOString().split('T')[0],
        batch_id: link.batch_id || null,
        course_id: link.course_id || null,
        ms_teams_id: null,
        ms_teams_email: null,
        payment_status: link.amount_paid >= link.final_fee ? 'paid' : 'pending',
        total_fee: link.final_fee,
        fee_paid: link.amount_paid,
        fee_due: Math.max(0, link.final_fee - link.amount_paid),
        next_payment_date: link.payment_scheme === 'installment' ? link.installment_2_due_date || null : null,
        lessons_completed: 0,
        assignments_completed: 0,
        total_watch_time: 0,
        last_activity_at: null,
        parent_contact: form.parentPhone || null,
        emergency_contact: null,
        notes: null,
      } as any,
      supabase,
    );
  } catch (spError: any) {
    console.error('[Direct Enrollment] Failed to create student_profile:', spError?.message, spError?.details);
    return { ok: false, status: 500, error: 'Failed to create student profile. Please contact support.', details: spError?.message };
  }

  // Best effort: the single Nexus classroom, so the roster shows them now.
  // link.batch_id is a `batches` id, not a nexus_batches id, so it is not passed.
  try {
    await enrollUserInDefaultClassroom(userId, {}, supabase);
  } catch (enrollErr: any) {
    console.warn('[Direct Enrollment] Default classroom enroll skipped:', enrollErr?.message);
  }

  const applicationNumber = studentProfile.student_id;

  // 3. One application per person: an existing lead row is completed, not duplicated.
  const { data: existingLead } = await supabase
    .from('lead_profiles')
    .select('id, source, admin_notes, application_number, country')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const finalPaymentMethod = pay.method || link.payment_method;
  const finalTransactionRef = pay.reference || link.transaction_reference || '';
  const leadFields = {
    application_number: applicationNumber,
    source: 'direct_link',
    status: 'enrolled',
    first_name: form.firstName || null,
    father_name: form.fatherName || null,
    date_of_birth: form.dateOfBirth || null,
    gender: form.gender || null,
    parent_phone: form.parentPhone || null,
    country: form.country || 'India',
    state: form.state || null,
    city: form.city || null,
    district: form.district || null,
    pincode: form.pincode || null,
    address: form.address || null,
    applicant_category: form.applicantCategory || null,
    academic_data: form.academicData || null,
    caste_category: form.casteCategory || null,
    // Number('2026-27') is NaN; parseExamYearAnswer takes either shape.
    target_exam_year: parseExamYearAnswer(form.targetExamYear as any).examYear,
    school_type: form.schoolType || null,
    interest_course: link.interest_course,
    selected_course_id: link.course_id || null,
    selected_center_id: link.center_id || null,
    learning_mode: link.learning_mode,
    phone_verified: true,
    phone_verified_at: form.phoneVerifiedAt || new Date().toISOString(),
    assigned_fee: link.total_fee,
    discount_amount: link.discount_amount,
    final_fee: link.final_fee,
    fee_structure_id: link.fee_structure_id || undefined,
    reviewed_by: input.verifiedBy || link.created_by,
    reviewed_at: new Date().toISOString(),
    admin_notes: `Direct enrollment via link. Payment: ₹${link.amount_paid} via ${finalPaymentMethod || 'unknown'}${finalTransactionRef ? ` (Ref: ${finalTransactionRef})` : ''}${input.verifiedBy ? ', verified by staff against the bank' : ''}`,
    form_step_completed: 4,
    demo_registration_id: link.demo_registration_id || null,
  };

  const { data: leadProfile, error: leadProfileError } = existingLead
    ? await supabase.from('lead_profiles').update(buildLeadProfileUpdate(existingLead, leadFields)).eq('id', existingLead.id).select().single()
    : await supabase.from('lead_profiles').insert({ user_id: userId, ...leadFields }).select().single();
  if (leadProfileError) {
    // Record-keeping only; never blocks the enrolment.
    console.error('[Direct Enrollment] Failed to create lead_profile:', leadProfileError.message, leadProfileError.details);
  }

  // 4. Money, through the office fee writer so Collections and reminders see it.
  const finalPaymentDate = pay.date || link.payment_date || new Date().toISOString();
  const finalFee = Number(link.final_fee) || 0;
  const amountPaid = Number(link.amount_paid) || 0;
  const today = istToday();
  const paidOnRaw = istDateOf(String(finalPaymentDate).length === 10 ? `${finalPaymentDate}T12:00:00+05:30` : finalPaymentDate) || today;
  const paidOn = paidOnRaw > today ? today : paidOnRaw;
  const scheme =
    link.payment_scheme === 'installment' || (link.payment_scheme !== 'full' && finalFee - amountPaid > 0.01) ? 'installment' : 'full';
  const paymentKey = `direct-link:${link.id}`;
  const proofUrl = pay.proofUrl || link.payment_proof_url || null;
  const verifiedFields = input.verifiedBy
    ? { screenshot_verified: true, verified_by: input.verifiedBy, verified_at: new Date().toISOString() }
    : {};

  let feesSaved = false;
  if (amountPaid > 0 && finalFee > 0) {
    try {
      await saveStudentApplicationAndFees(
        {
          userId,
          plan: {
            assignedFee: Number(link.total_fee) || finalFee,
            discount: Number(link.discount_amount) || 0,
            scheme,
            installment1Amount: scheme === 'installment' ? amountPaid : null,
            installment2Amount: scheme === 'installment' ? Math.round((finalFee - amountPaid) * 100) / 100 : null,
            installment2DueDate: scheme === 'installment' ? link.installment_2_due_date || defaultBalanceDueDate(paidOn) : null,
          },
          payments: [
            {
              key: paymentKey,
              amount: amountPaid,
              paidOn,
              method: isOfficePaymentMethod(finalPaymentMethod) ? finalPaymentMethod : 'manual',
              reference: finalTransactionRef || null,
              installmentNumber: 1,
            },
          ],
          adminId: input.verifiedBy || link.created_by,
        } as any,
        supabase,
      );
      feesSaved = true;
      // The office writer knows nothing of the proof, the UTR or the link; add them.
      const { error: proofError } = await supabase
        .from('payments')
        .update({
          screenshot_url: proofUrl,
          direct_payment_screenshot_url: proofUrl,
          direct_payment_utr: pay.utr || null,
          description: `Direct enrolment link payment.${finalTransactionRef ? ` Transaction: ${finalTransactionRef}` : ''}`,
          ...verifiedFields,
        })
        .eq('idempotency_key', paymentKey);
      if (proofError) console.error('[Direct Enrollment] payment proof update failed:', proofError.message);
    } catch (feeErr: any) {
      console.error('[Direct Enrollment] Fee plan save failed, recording the payment directly:', feeErr?.message);
    }
  }

  if (!feesSaved) {
    // Fallback so the money is never lost: a bare payment row.
    const { error: paymentError } = await supabase.from('payments').insert({
      user_id: userId,
      student_profile_id: studentProfile.id,
      lead_profile_id: leadProfile?.id || null,
      amount: amountPaid,
      currency: 'INR',
      status: 'paid',
      payment_method: finalPaymentMethod,
      receipt_number: `NR-DE-${Date.now().toString(36).toUpperCase()}`,
      paid_at: finalPaymentDate,
      screenshot_url: proofUrl,
      direct_payment_screenshot_url: proofUrl,
      direct_payment_utr: pay.utr || null,
      installment_number: 1,
      idempotency_key: paymentKey,
      description: `Direct payment (${scheme}).${finalTransactionRef ? ` Transaction: ${finalTransactionRef}` : ''}`,
      ...verifiedFields,
    });
    // Never blocks the enrolment, never swallowed: a missing row understates revenue.
    if (paymentError) {
      console.error('[Direct Enrollment] Failed to create payment record:', paymentError.message, paymentError.details);
    }
  }

  // 5. Demo attribution: the application takes the demo's source when it has none.
  if (link.demo_registration_id && leadProfile?.id) {
    const { data: demo } = await supabase
      .from('demo_class_registrations')
      .select('channel, utm_source, utm_medium, utm_campaign')
      .eq('id', link.demo_registration_id)
      .maybeSingle();
    if (demo) {
      const { error: attributionError } = await supabase
        .from('lead_profiles')
        .update({ utm_source: demo.utm_source || demo.channel || null, utm_medium: demo.utm_medium || null, utm_campaign: demo.utm_campaign || null })
        .eq('id', leadProfile.id)
        .is('utm_source', null);
      if (attributionError) console.error('[Direct Enrollment] Demo attribution failed:', attributionError.message);
    }
  }

  await closeDemoFollowUpsOnEnrol(userId, supabase).catch((e: any) =>
    console.error('[Direct Enrollment] close follow-ups failed:', e?.message),
  );

  // 6. The link is used.
  const linkUpdate: Record<string, unknown> = {
    status: 'used',
    used_by: userId,
    used_at: new Date().toISOString(),
    lead_profile_id: leadProfile?.id || null,
    student_profile_id: studentProfile.id,
  };
  if (pay.method) linkUpdate.payment_method = pay.method;
  if (pay.date) linkUpdate.payment_date = pay.date;
  if (pay.reference) linkUpdate.transaction_reference = pay.reference;
  if (pay.proofUrl) linkUpdate.payment_proof_url = pay.proofUrl;
  if (input.verifiedBy) {
    linkUpdate.verified_by = input.verifiedBy;
    linkUpdate.verified_at = new Date().toISOString();
  }
  await updateDirectEnrollmentLink(link.id, linkUpdate as any, supabase);

  if (link.batch_id) {
    try {
      await incrementBatchEnrollment(link.batch_id, supabase);
    } catch (e) {
      console.warn('Failed to increment batch enrollment:', e);
    }
  }

  // 7. Document collection later, and onboarding steps.
  await supabase.from('post_enrollment_details').insert({
    student_profile_id: studentProfile.id,
    user_id: userId,
    father_name: form.fatherName || null,
    caste_category: form.casteCategory || null,
    form_completed: false,
  });
  try {
    await initializeStudentOnboarding(studentProfile.id, userId, 'direct', supabase);
  } catch (e) {
    console.warn('Failed to initialize onboarding steps:', e);
  }

  try {
    await notifyNewApplication({
      applicationNumber,
      userName: form.firstName || link.student_name || 'Unknown',
      phone: input.authPhone || link.student_phone || '',
      course: link.interest_course,
      city: form.city || '',
      state: form.state || '',
      source: 'direct_link',
    } as any);
  } catch (e) {
    console.warn('Failed to send notification:', e);
  }

  // 8. One record per family: keep the link's numbers as contacts, fold in leads.
  await addUserPhoneContact(
    userId,
    link.student_phone,
    { relation: link.parent_phone && sameMobile(link.parent_phone, link.student_phone) ? 'parent' : 'unknown', source: 'enrolment_link' } as any,
    supabase,
  ).catch(() => false);
  if (link.parent_phone) {
    await addUserPhoneContact(userId, link.parent_phone, { relation: 'parent', source: 'enrolment_link' } as any, supabase).catch(() => false);
  }
  await resolveDuplicatesFor(userId, { via: 'auto' } as any, supabase);

  return { ok: true, applicationNumber, studentProfileId: studentProfile.id, leadProfileId: leadProfile?.id || null, paymentKey };
}
