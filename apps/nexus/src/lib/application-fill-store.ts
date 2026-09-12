/**
 * Copies a missing class and exam year off each student's own application form.
 *
 * What is safe to copy is decided in application-form.ts. This is the database
 * side: find the students with a gap, read their forms, and write what the plan
 * allows, leaving the same audit trail a staff edit leaves.
 *
 * Callers: the daily cron (no actor, every live classroom), Nexus Add and the form
 * link route (the staff member who acted). One student's failure never stops the
 * rest; it is counted in `errors`.
 *
 * Every write is conditional on the value still being empty, so a teacher who sets
 * a class while this runs keeps their value.
 */

import { getCurrentBatch, recordUserHistory, type NexusStudyStage } from '@neram/database';
import { pickApplicationForm, planApplicationFill, type ApplicationForm } from './application-form';

export interface FillScope {
  classroomId?: string;
  userIds?: string[];
  /** The staff member who caused the fill, or null for the daily pass. */
  actorId: string | null;
  /** Written on each audit row. */
  reason?: string;
  today?: Date;
}

export interface FilledStudent {
  userId: string;
  classroomId: string;
  studyStage: NexusStudyStage | null;
  academicYear: string | null;
}

export interface HeldStudent {
  userId: string;
  classroomId: string;
  reasons: string[];
}

export interface FillSummary {
  /** Enrolments that had a class or exam year missing. */
  checked: number;
  stagesFilled: number;
  yearsFilled: number;
  /** Enrolments where the form held something that was not safe to copy. */
  held: number;
  filled: FilledStudent[];
  heldDetails: HeldStudent[];
  errors: string[];
}

export const AUTOMATIC_FILL_REASON = 'Filled automatically from the application form';

const FORM_FIELDS =
  'id, user_id, application_number, academic_data, applicant_category, target_exam_year, father_name, created_at';

export async function fillFromApplicationForms(supabase: any, scope: FillScope): Promise<FillSummary> {
  const summary: FillSummary = {
    checked: 0,
    stagesFilled: 0,
    yearsFilled: 0,
    held: 0,
    filled: [],
    heldDetails: [],
    errors: [],
  };
  if (scope.userIds && scope.userIds.length === 0) return summary;

  const today = scope.today ?? new Date();
  const reason = scope.reason ?? AUTOMATIC_FILL_REASON;

  // Archived classrooms are past cohorts and graduated students have left, so
  // neither is worth a class. Dormant students are included: their class still
  // matters the day they come back.
  let query = supabase
    .from('nexus_enrollments')
    .select(
      'id, user_id, classroom_id, current_standard, ' +
        'classroom:nexus_classrooms!inner(is_archived), ' +
        'user:users!nexus_enrollments_user_id_fkey!inner(academic_year, is_alumni)',
    )
    .eq('role', 'student')
    .eq('is_active', true)
    .eq('nexus_classrooms.is_archived', false)
    .eq('users.is_alumni', false);
  if (scope.classroomId) query = query.eq('classroom_id', scope.classroomId);
  if (scope.userIds) query = query.in('user_id', scope.userIds);

  const { data: enrollments, error: enrollmentError } = await query;
  if (enrollmentError) throw enrollmentError;

  const gaps = ((enrollments || []) as any[]).filter((row) => !row.current_standard || !row.user?.academic_year);
  summary.checked = gaps.length;
  if (!gaps.length) return summary;

  const userIds = Array.from(new Set(gaps.map((row) => row.user_id as string)));
  const [{ data: forms, error: formError }, batch] = await Promise.all([
    supabase.from('lead_profiles').select(FORM_FIELDS).in('user_id', userIds).is('deleted_at', null),
    getCurrentBatch(),
  ]);
  if (formError) throw formError;
  const currentBatch: string | null = batch?.code ?? null;

  const formsByUser = new Map<string, ApplicationForm[]>();
  for (const row of (forms || []) as ApplicationForm[]) {
    const list = formsByUser.get(row.user_id) ?? [];
    list.push(row);
    formsByUser.set(row.user_id, list);
  }

  // The exam year belongs to the person, so a student in two classrooms is
  // written once and the second enrolment sees the new value.
  const yearWritten = new Map<string, string>();

  for (const row of gaps) {
    const form = pickApplicationForm(formsByUser.get(row.user_id));
    if (!form) continue;

    const plan = planApplicationFill({
      stage: (row.current_standard ?? null) as NexusStudyStage | null,
      academicYear: yearWritten.get(row.user_id) ?? row.user?.academic_year ?? null,
      form,
      currentBatch,
      today,
    });
    if (plan.held.length) {
      summary.held += 1;
      summary.heldDetails.push({ userId: row.user_id, classroomId: row.classroom_id, reasons: plan.held });
    }
    if (!plan.studyStage && !plan.academicYear) continue;

    try {
      const now = new Date().toISOString();
      const events: Record<string, unknown>[] = [];
      const filled: FilledStudent = {
        userId: row.user_id,
        classroomId: row.classroom_id,
        studyStage: null,
        academicYear: null,
      };

      if (plan.studyStage) {
        const { data: updated, error } = await supabase
          .from('nexus_enrollments')
          .update({
            current_standard: plan.studyStage,
            current_standard_source: 'application',
            current_standard_set_at: now,
            current_standard_set_by: scope.actorId,
          })
          .eq('id', row.id)
          .is('current_standard', null)
          .select('id');
        if (error) throw error;
        if (updated?.length) {
          summary.stagesFilled += 1;
          filled.studyStage = plan.studyStage;
          events.push({
            enrollment_id: row.id,
            classroom_id: row.classroom_id,
            student_id: row.user_id,
            axis: 'study_stage',
            from_value: null,
            to_value: plan.studyStage,
            reason,
            performed_by: scope.actorId,
          });
        }
      }

      if (plan.academicYear) {
        const { data: updated, error } = await supabase
          .from('users')
          .update({ academic_year: plan.academicYear, updated_at: now })
          .eq('id', row.user_id)
          .is('academic_year', null)
          .select('id');
        if (error) throw error;
        if (updated?.length) {
          summary.yearsFilled += 1;
          filled.academicYear = plan.academicYear;
          yearWritten.set(row.user_id, plan.academicYear);
          // The Admin CRM timeline credits a person for each change. The daily
          // pass has none, and its audit row below says what made the change.
          if (scope.actorId) {
            await recordUserHistory(supabase, row.user_id, 'academic_year', null, plan.academicYear, scope.actorId);
          }
          events.push({
            enrollment_id: row.id,
            classroom_id: row.classroom_id,
            student_id: row.user_id,
            axis: 'academic_year',
            from_value: null,
            to_value: plan.academicYear,
            reason,
            performed_by: scope.actorId,
          });
        }
      }

      if (events.length) {
        const { error: auditError } = await supabase.from('nexus_enrollment_classification_events').insert(events);
        if (auditError) console.error('[application-fill] audit insert failed:', auditError.message);
        summary.filled.push(filled);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String((err as any)?.message ?? err);
      summary.errors.push(`enrolment ${row.id}: ${message}`);
    }
  }

  return summary;
}
