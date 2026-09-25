/**
 * Students reporting a broken catch-up checkpoint question.
 *
 * The checkpoint quiz cannot be closed (RecapWatch opens it with
 * dismissable={false}), which is right while the questions are sound and a trap
 * the moment one is not: a question whose answer key is wrong is a gate the
 * student can never pass and can never leave. Their only exits were Retry and
 * Rewatch and Retry, and neither of those tells anybody.
 *
 * So a report does two things at once. It tells the teacher, and it takes that
 * question out of the student's way. The second half is why there is a unique
 * index on (question_id, student_id): without it, reporting would be a way
 * through the gate rather than a way to fix it.
 */
import { getSupabaseAdminClient } from '../../client';
import type { TypedSupabaseClient } from '../../client';

const REPORTS = 'nexus_class_recap_question_reports';
const QUESTIONS = 'nexus_class_recap_questions';
const SECTIONS = 'nexus_class_recap_sections';

export type RecapQuestionReportType =
  | 'wrong_answer'
  | 'no_correct_option'
  | 'unclear_question'
  | 'not_taught'
  | 'other';

export type RecapQuestionReportStatus = 'open' | 'resolved' | 'dismissed';

export interface RecapQuestionReport {
  id: string;
  question_id: string;
  recap_id: string;
  section_id: string;
  student_id: string;
  report_type: RecapQuestionReportType;
  description: string | null;
  status: RecapQuestionReportStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A report with enough around it to render a row without a second query. */
export interface RecapQuestionReportRow extends RecapQuestionReport {
  question_text: string | null;
  /** False once a teacher has rewritten the checkpoint: the question is gone. */
  question_active: boolean;
  section_title: string | null;
  student_name: string | null;
  /**
   * Carried so the teacher's list can draw the face beside the name.
   * student-name-face.test.ts fails the build on a teacher screen that prints a
   * student's name with nothing to recognise them by, which is the whole reason
   * this column is on the row rather than fetched separately.
   */
  student_avatar_url: string | null;
  class_id: string | null;
  class_title: string | null;
  scheduled_date: string | null;
}

/**
 * File a report, or say it was already filed.
 *
 * `created: false` is not an error. A student who taps the same question twice,
 * or whose connection retried the request, gets the same answer as the first
 * time: the question is reported and it is out of their way. Distinguishing the
 * two matters only to the caller deciding whether to say "thanks" or "you
 * already told us".
 */
export async function reportRecapQuestion(
  input: {
    questionId: string;
    studentId: string;
    reportType: RecapQuestionReportType;
    description?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<{ created: boolean; report: RecapQuestionReport | null }> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  // recap_id and section_id are stored on the report rather than looked up on
  // read. Saving a checkpoint deactivates its questions and inserts fresh rows,
  // so a report that walked the question back to its class would lose its way
  // the first time a teacher edited the checkpoint.
  const { data: question, error: qErr } = await supabase
    .from(QUESTIONS)
    .select('id, section_id')
    .eq('id', input.questionId)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!question) return { created: false, report: null };

  const { data: section, error: sErr } = await supabase
    .from(SECTIONS)
    .select('id, recap_id')
    .eq('id', question.section_id)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!section) return { created: false, report: null };

  const { data, error } = await supabase
    .from(REPORTS)
    .insert({
      question_id: input.questionId,
      recap_id: section.recap_id,
      section_id: section.id,
      student_id: input.studentId,
      report_type: input.reportType,
      description: input.description?.trim() ? input.description.trim().slice(0, 1000) : null,
    })
    .select('*')
    .single();

  if (error) {
    // 23505 is the (question_id, student_id) unique index. Already told us.
    if ((error as any).code === '23505') {
      const { data: existing } = await supabase
        .from(REPORTS)
        .select('*')
        .eq('question_id', input.questionId)
        .eq('student_id', input.studentId)
        .maybeSingle();
      return { created: false, report: (existing as RecapQuestionReport) || null };
    }
    throw error;
  }

  return { created: true, report: data as RecapQuestionReport };
}

/**
 * Every question this student has reported on one recap.
 *
 * Read on the way into a checkpoint so their own reports keep being skipped
 * across sessions. A student who reported a broken question on Tuesday must not
 * meet it again on Wednesday.
 */
export async function listReportedQuestionIdsForStudent(
  recapId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<string[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from(REPORTS)
    .select('question_id')
    .eq('recap_id', recapId)
    .eq('student_id', studentId);
  if (error) throw error;
  return ((data as Array<{ question_id: string }>) || []).map((r) => r.question_id);
}

/**
 * The teacher's inbox: open reports across a set of classrooms.
 *
 * Scoped by classroom through the recap, the same way listRecapsNeedingReview
 * is, so a teacher sees their own rooms and nobody else's.
 */
export async function listOpenRecapQuestionReports(
  classroomIds: string[],
  client?: TypedSupabaseClient,
  limit = 100,
): Promise<RecapQuestionReportRow[]> {
  if (!classroomIds.length) return [];
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data, error } = await supabase
    .from(REPORTS)
    .select(
      `*,
       question:nexus_class_recap_questions(question_text, is_active),
       section:nexus_class_recap_sections(title),
       student:users!nexus_class_recap_question_reports_student_id_fkey(name, avatar_url),
       recap:nexus_class_recaps(classroom_id, scheduled_class_id, class:nexus_scheduled_classes(id, title, scheduled_date))`,
    )
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data as any[]) || [];
  return rows
    .filter((r) => r.recap && classroomIds.includes(r.recap.classroom_id))
    .map((r) => ({
      id: r.id,
      question_id: r.question_id,
      recap_id: r.recap_id,
      section_id: r.section_id,
      student_id: r.student_id,
      report_type: r.report_type,
      description: r.description ?? null,
      status: r.status,
      resolution_note: r.resolution_note ?? null,
      resolved_by: r.resolved_by ?? null,
      resolved_at: r.resolved_at ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      question_text: r.question?.question_text ?? null,
      question_active: r.question?.is_active !== false,
      section_title: r.section?.title ?? null,
      student_name: r.student?.name ?? null,
      student_avatar_url: r.student?.avatar_url ?? null,
      class_id: r.recap?.class?.id ?? r.recap?.scheduled_class_id ?? null,
      class_title: r.recap?.class?.title ?? null,
      scheduled_date: r.recap?.class?.scheduled_date ?? null,
    }));
}

/** How many open reports each recap has, for the badge on a list row. */
export async function countOpenReportsByRecap(
  recapIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, number>> {
  if (!recapIds.length) return {};
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from(REPORTS)
    .select('recap_id')
    .eq('status', 'open')
    .in('recap_id', recapIds);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of (data as Array<{ recap_id: string }>) || []) {
    out[r.recap_id] = (out[r.recap_id] || 0) + 1;
  }
  return out;
}

/** Close a report, with who closed it and what they did. */
export async function resolveRecapQuestionReport(
  input: {
    reportId: string;
    status: Exclude<RecapQuestionReportStatus, 'open'>;
    resolvedBy: string | null;
    note?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { error } = await supabase
    .from(REPORTS)
    .update({
      status: input.status,
      resolution_note: input.note?.trim() ? input.note.trim().slice(0, 1000) : null,
      resolved_by: input.resolvedBy,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.reportId);
  if (error) throw error;
}
