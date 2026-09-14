import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { canUser } from '@/lib/staff-capabilities';
import {
  maskEmail,
  maskPhone,
  pickApplicationForm,
  type FormDetailView,
  type FormLinkBlock,
} from '@/lib/application-form';
import { describeAgreement, matchApplicationForms } from '@/lib/application-form-match';
import {
  LEAD_PROFILE_KEY_COLUMNS,
  LEAD_PROFILE_PUBLIC_COLUMNS,
  selectColumns,
} from '@/lib/student-finance';

export const dynamic = 'force-dynamic';

/**
 * GET /api/students/application-forms/detail?classroom=&student=&form=
 *
 * One proposed application form, in full, so a person can read it before
 * merging two records for good. The list route (../route.ts) deliberately
 * sends only a summary; this is the deeper read behind "View full form".
 *
 * WHAT IT WILL NOT SERVE.
 *   - Anything on LEAD_PROFILE_FINANCE_COLUMNS. Fees, scholarship, caste and
 *     the utm_* fields are gated on coord.student.finance and have nothing to
 *     do with deciding whose form this is, so they are simply never selected.
 *   - Full phone and email, unless the viewer can actually link. A proposed
 *     record may belong to a different person, so a teacher gets a masked
 *     value: enough to compare the last digits, not a stranger's contact.
 *   - Any pair the matcher would not propose. Without that check this route
 *     would read any lead_profiles row given two ids, so the same rule that
 *     guards ../link/route.ts guards the read.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_FIELDS =
  'id, name, first_name, last_name, email, personal_email, linked_classroom_email, phone, ms_oid, user_type, staff_role';

/** The name a person typed on that record. The apply flow's "User" is not one. */
function typedName(user: any, form: any): string | null {
  const typed = [user?.first_name, user?.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  if (typed) return typed;
  if (form?.first_name && String(form.first_name).trim()) return String(form.first_name).trim();
  const name = String(user?.name || '').trim();
  return name && name.toLowerCase() !== 'user' ? name : null;
}

export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'coord.student.view');
    const canLink = canUser(caller as any, 'structure.student.account');

    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroom');
    const studentId = params.get('student');
    const formUserId = params.get('form');
    if (![classroomId, studentId, formUserId].every((value) => value && UUID.test(value))) {
      return NextResponse.json({ error: 'classroom, student and form are required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // The security boundary, as in ../link/route.ts: an active student of this
    // classroom, nothing else.
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('nexus_enrollments')
      .select('id')
      .eq('classroom_id', classroomId)
      .eq('user_id', studentId)
      .eq('role', 'student')
      .eq('is_active', true)
      .maybeSingle();
    if (enrollmentError) throw enrollmentError;
    if (!enrollment) return NextResponse.json({ error: 'That student is not in this classroom.' }, { status: 404 });

    const [people, forms, otherEnrollments, profiles] = await Promise.all([
      supabase.from('users').select(USER_FIELDS).in('id', [studentId, formUserId]),
      supabase
        .from('lead_profiles')
        .select(selectColumns(LEAD_PROFILE_KEY_COLUMNS, LEAD_PROFILE_PUBLIC_COLUMNS))
        .eq('user_id', formUserId)
        .is('deleted_at', null),
      supabase
        .from('nexus_enrollments')
        .select('id')
        .eq('user_id', formUserId)
        .eq('role', 'student')
        .eq('is_active', true)
        .limit(1),
      supabase.from('student_profiles').select('user_id').in('user_id', [studentId, formUserId]),
    ]);
    for (const result of [people, forms, otherEnrollments, profiles]) if (result.error) throw result.error;

    const student = (people.data || []).find((row: any) => row.id === studentId);
    const formUser = (people.data || []).find((row: any) => row.id === formUserId);
    if (!student || !formUser) {
      return NextResponse.json({ error: 'That form is no longer on a separate record.' }, { status: 404 });
    }
    if (formUser.staff_role || formUser.user_type === 'admin' || formUser.user_type === 'teacher') {
      return NextResponse.json({ error: 'That record belongs to a member of staff.' }, { status: 404 });
    }

    const form = pickApplicationForm(forms.data as any);
    if (!form) {
      return NextResponse.json({ error: 'That record holds no application form any more.' }, { status: 404 });
    }
    const raw = form as any;

    const identity = {
      userId: formUserId as string,
      names: [formUser.name, formUser.first_name, formUser.last_name, raw.first_name],
      fatherName: raw.father_name ?? null,
      phones: [formUser.phone],
      emails: [formUser.email, formUser.personal_email],
    };
    const viewer = {
      id: studentId as string,
      name: student.name,
      phones: [student.phone],
      emails: [student.email, student.personal_email, student.linked_classroom_email],
    };

    // Not a pair the matcher would propose, so not a pair anyone may read.
    const [match] = matchApplicationForms(viewer, [identity]);
    if (!match) return NextResponse.json({ error: 'That form does not match this student.' }, { status: 404 });

    const withFees = new Set(((profiles.data || []) as any[]).map((row) => row.user_id));
    const blocked: FormLinkBlock | null =
      formUser.ms_oid && formUser.ms_oid !== student.ms_oid
        ? 'other_microsoft_account'
        : otherEnrollments.data?.length || (withFees.has(formUserId) && withFees.has(studentId))
          ? 'both_fee_records'
          : null;

    const phone = (value: string | null | undefined) => (canLink ? (value ?? null) : maskPhone(value));
    const email = (value: string | null | undefined) => (canLink ? (value ?? null) : maskEmail(value));

    const payload: FormDetailView = {
      student: {
        id: studentId as string,
        name: student.name || 'Student',
        email: email(student.linked_classroom_email || student.email || student.personal_email),
        phone: phone(student.phone),
      },
      form: {
        applicationNumber: raw.application_number ?? null,
        status: raw.status ?? null,
        createdAt: raw.created_at ?? null,
        formCompletedAt: raw.form_completed_at ?? null,
        formStepCompleted: raw.form_step_completed ?? null,
        name: typedName(formUser, raw),
        fatherName: raw.father_name?.trim() || null,
        parentPhone: phone(raw.parent_phone),
        dateOfBirth: raw.date_of_birth ?? null,
        gender: raw.gender ?? null,
        phone: phone(formUser.phone),
        email: email(formUser.email || formUser.personal_email),
        applicantCategory: raw.applicant_category ?? null,
        academicData: raw.academic_data ?? null,
        targetExamYear: raw.target_exam_year ?? null,
        schoolType: raw.school_type ?? null,
        learningMode: raw.learning_mode ?? null,
        interestCourse: raw.interest_course ?? null,
        hybridLearningAccepted: raw.hybrid_learning_accepted ?? null,
        phoneVerified: raw.phone_verified ?? null,
        phoneVerifiedAt: raw.phone_verified_at ?? null,
        country: raw.country ?? null,
        state: raw.state ?? null,
        district: raw.district ?? null,
        city: raw.city ?? null,
        pincode: raw.pincode ?? null,
        address: raw.address ?? null,
        locationSource: raw.location_source ?? null,
      },
      agreement: describeAgreement(viewer, identity),
      reasons: match.reasons,
      strength: match.strength,
      blocked,
      canLink,
      showsFullContact: canLink,
    };

    return NextResponse.json(payload);
  } catch (err) {
    return errorResponse(err, 'Failed to open the application form');
  }
}
