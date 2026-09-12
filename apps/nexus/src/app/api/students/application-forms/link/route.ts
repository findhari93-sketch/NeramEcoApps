import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, mergeUserRecords, recordUserHistory } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { pickApplicationForm, type FormLinkResult } from '@/lib/application-form';
import { matchApplicationForms } from '@/lib/application-form-match';
import { fillFromApplicationForms } from '@/lib/application-fill-store';

export const dynamic = 'force-dynamic';
// The merge repoints references across every user-linked table in one transaction.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FORM_FIELDS =
  'id, user_id, application_number, academic_data, applicant_category, target_exam_year, father_name, first_name, created_at';

function refuse(error: string, status = 409) {
  return NextResponse.json({ error }, { status });
}

/**
 * POST /api/students/application-forms/link
 * Body: { classroomId, studentId, formUserId }
 *
 * "Yes, this is their form." Joins the record holding the application form onto the
 * student's Nexus record with merge_user_records, then fills whatever class and
 * exam year is still missing from that form.
 *
 * The NEXUS record always survives. The merge keeps the survivor's name, user type
 * and Nexus sign-in history and only borrows the empty fields (phone, phone login,
 * first name) from the other, so the student's Microsoft identity is untouched.
 *
 * Refused, with a reason a person can act on, when the join could lose something
 * or join two different people:
 *   - the other record has its own Microsoft account;
 *   - the other record is itself enrolled in Nexus (that is the two-records case);
 *   - both records carry a fee record (the merge keeps only one);
 *   - the pair is not one the matcher would propose, so a hand-made request cannot
 *     merge two arbitrary users.
 */
export async function POST(request: NextRequest) {
  try {
    const staff = await getRequestUser(request.headers.get('Authorization'));
    // Irreversible and it moves fees and logins, so it stays with the internal team.
    assertCapability(staff, 'structure.student.account');

    const body = await request.json().catch(() => ({}));
    const { classroomId, studentId, formUserId } = (body ?? {}) as Record<string, unknown>;
    if (![classroomId, studentId, formUserId].every((value) => typeof value === 'string' && UUID.test(value))) {
      return refuse('classroomId, studentId and formUserId are required.', 400);
    }
    if (studentId === formUserId) return refuse('That form is already on this student.', 400);

    const supabase = getSupabaseAdminClient() as any;

    // The security boundary: only a student actively enrolled in this classroom.
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('nexus_enrollments')
      .select('id')
      .eq('classroom_id', classroomId)
      .eq('user_id', studentId)
      .eq('role', 'student')
      .eq('is_active', true)
      .maybeSingle();
    if (enrollmentError) throw enrollmentError;
    if (!enrollment) return refuse('That student is not in this classroom.', 404);

    const { data: people, error: peopleError } = await supabase
      .from('users')
      .select(
        'id, name, first_name, last_name, email, personal_email, linked_classroom_email, phone, ms_oid, user_type, staff_role, academic_year',
      )
      .in('id', [studentId, formUserId]);
    if (peopleError) throw peopleError;
    const student = (people || []).find((row: any) => row.id === studentId);
    const formUser = (people || []).find((row: any) => row.id === formUserId);
    if (!student) return refuse('That student could not be found.', 404);
    if (!formUser) return refuse('That form is no longer on a separate record. Reload and check again.', 404);

    if (formUser.staff_role || formUser.user_type === 'admin' || formUser.user_type === 'teacher') {
      return refuse('That record belongs to a member of staff, so it cannot be linked.');
    }
    if (formUser.ms_oid && formUser.ms_oid !== student.ms_oid) {
      return refuse(
        'That record has its own Microsoft account, so it may be a different student. If it is the same person, merge the two in Admin.',
      );
    }

    const [otherEnrollments, forms, profiles] = await Promise.all([
      supabase
        .from('nexus_enrollments')
        .select('id')
        .eq('user_id', formUserId)
        .eq('role', 'student')
        .eq('is_active', true)
        .limit(1),
      supabase.from('lead_profiles').select(FORM_FIELDS).eq('user_id', formUserId).is('deleted_at', null),
      supabase.from('student_profiles').select('user_id').in('user_id', [studentId, formUserId]),
    ]);
    for (const result of [otherEnrollments, forms, profiles]) if (result.error) throw result.error;

    if (otherEnrollments.data?.length) {
      return refuse('That record is enrolled in a Nexus classroom itself. Merge the two records in Admin instead.');
    }
    const form = pickApplicationForm(forms.data);
    if (!form) return refuse('That record holds no application form any more. Reload and check again.');
    if ((profiles.data || []).length >= 2) {
      return refuse('Both records have a fee record. Merge them in Admin so neither fee record is lost.');
    }

    // The same rule that proposed the form. Nothing else may be merged from here.
    const [match] = matchApplicationForms(
      {
        id: studentId as string,
        name: student.name,
        phones: [student.phone],
        emails: [student.email, student.personal_email, student.linked_classroom_email],
      },
      [
        {
          userId: formUserId as string,
          names: [formUser.name, formUser.first_name, formUser.last_name, form.first_name],
          fatherName: form.father_name ?? null,
          phones: [formUser.phone],
          emails: [formUser.email, formUser.personal_email],
        },
      ],
    );
    if (!match) return refuse('That form does not match this student closely enough to link from here.');

    // A rejection recorded earlier would otherwise outlive the decision to link.
    await supabase
      .from('nexus_application_form_dismissals')
      .delete()
      .eq('student_id', studentId)
      .eq('form_user_id', formUserId)
      .then(() => undefined, () => undefined);

    const yearBefore: string | null = student.academic_year ?? null;
    await mergeUserRecords(studentId as string, formUserId as string, staff.id, supabase);

    // The merge takes the other record's exam year when this one had none. That is
    // a real change to the student's cohort, so it is recorded like one.
    const { data: after, error: afterError } = await supabase
      .from('users')
      .select('academic_year')
      .eq('id', studentId)
      .maybeSingle();
    if (afterError) throw afterError;
    const yearAfter: string | null = after?.academic_year ?? null;
    if (yearAfter !== yearBefore) {
      await recordUserHistory(supabase, studentId as string, 'academic_year', yearBefore, yearAfter, staff.id);
      const { error: auditError } = await supabase.from('nexus_enrollment_classification_events').insert({
        enrollment_id: enrollment.id,
        classroom_id: classroomId,
        student_id: studentId,
        axis: 'academic_year',
        from_value: yearBefore,
        to_value: yearAfter,
        reason: 'Came with the linked application form record',
        performed_by: staff.id,
      });
      if (auditError) console.error('[application-forms/link] audit insert failed:', auditError.message);
    }
    await recordUserHistory(
      supabase,
      studentId as string,
      'application_form_linked',
      null,
      { merged_user_id: formUserId, application_number: form.application_number ?? null },
      staff.id,
    );

    // The link has happened either way. A failed fill leaves the gap for the daily
    // pass, which is not a reason to tell staff the link failed.
    let filledStage: FormLinkResult['filled']['studyStage'] = null;
    let filledYear: string | null = yearAfter !== yearBefore ? yearAfter : null;
    let held: string[] = [];
    try {
      const fill = await fillFromApplicationForms(supabase, {
        userIds: [studentId as string],
        classroomId: classroomId as string,
        actorId: staff.id,
        reason: 'Filled from the application form when it was linked',
      });
      const filled = fill.filled.find((row) => row.classroomId === classroomId);
      filledStage = filled?.studyStage ?? null;
      filledYear = filled?.academicYear ?? filledYear;
      held = fill.heldDetails.find((row) => row.classroomId === classroomId)?.reasons ?? [];
    } catch (fillError) {
      console.error('[application-forms/link] fill after link failed:', fillError);
    }

    const result: FormLinkResult = {
      linked: true,
      applicationNumber: form.application_number ?? null,
      filled: { studyStage: filledStage, academicYear: filledYear },
      held,
    };
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, 'Failed to link the application form');
  }
}
