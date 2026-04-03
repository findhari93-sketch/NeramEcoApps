// @ts-nocheck — tables not yet in generated types (migration pending)
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

// ============================================================
// Course Plan Homework Queries
// ============================================================

/**
 * List homework for a plan with session join
 */
export async function getHomeworkByPlan(
  planId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_course_plan_homework')
    .select(`
      *,
      session:nexus_course_plan_sessions(id, day_number, day_of_week, slot, title)
    `)
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as any;
}

/**
 * Create homework
 */
export async function createHomework(
  data: Record<string, unknown>,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: homework, error } = await supabase
    .from('nexus_course_plan_homework')
    .insert(data as any)
    .select()
    .single();
  if (error) throw error;
  return homework;
}

/**
 * Get homework grading grid: returns homework list, students, and all submissions
 * for building the teacher grading matrix.
 */
export async function getHomeworkGradingGrid(
  planId: string,
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Fetch all homework for the plan
  const { data: homework, error: hwError } = await supabase
    .from('nexus_course_plan_homework')
    .select(`
      *,
      session:nexus_course_plan_sessions(id, day_number, day_of_week, slot, title)
    `)
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });
  if (hwError) throw hwError;

  // Fetch active students in the classroom
  const { data: enrollments, error: enrollError } = await supabase
    .from('nexus_enrollments')
    .select('user:users!nexus_enrollments_user_id_fkey(id, name, email, avatar_url)')
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true);
  if (enrollError) throw enrollError;

  const students = (enrollments || []).map((e: any) => e.user).filter(Boolean);

  // Fetch all submissions for this plan's homework
  const homeworkIds = (homework || []).map((h: any) => h.id);
  let submissions: any[] = [];
  if (homeworkIds.length > 0) {
    const { data: subs, error: subError } = await supabase
      .from('nexus_homework_submissions')
      .select('*')
      .in('homework_id', homeworkIds);
    if (subError) throw subError;
    submissions = subs || [];
  }

  return {
    homework: homework || [],
    students,
    submissions,
  };
}

/**
 * Submit homework — upsert submission with status='submitted'
 */
export async function submitHomework(
  homeworkId: string,
  studentId: string,
  data: { attachments?: any[]; text_response?: string },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: submission, error } = await supabase
    .from('nexus_homework_submissions')
    .upsert(
      {
        homework_id: homeworkId,
        student_id: studentId,
        status: 'submitted',
        attachments: data.attachments || [],
        text_response: data.text_response,
        submitted_at: new Date().toISOString(),
      } as any,
      { onConflict: 'homework_id,student_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return submission;
}

/**
 * Review homework — update submission with points and feedback
 */
export async function reviewHomework(
  submissionId: string,
  reviewerId: string,
  data: { points_earned?: number; teacher_feedback?: string; status?: string },
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data: submission, error } = await supabase
    .from('nexus_homework_submissions')
    .update({
      points_earned: data.points_earned,
      teacher_feedback: data.teacher_feedback,
      status: data.status || 'reviewed',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    } as any)
    .eq('id', submissionId)
    .select()
    .single();
  if (error) throw error;
  return submission;
}

/**
 * Get all homework for a student in a plan with their submissions (left join approach)
 */
export async function getStudentHomework(
  planId: string,
  studentId: string,
  statusFilter?: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  // Fetch all homework for the plan
  const { data: homework, error: hwError } = await supabase
    .from('nexus_course_plan_homework')
    .select(`
      *,
      session:nexus_course_plan_sessions(id, day_number, day_of_week, slot, title)
    `)
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });
  if (hwError) throw hwError;

  // Fetch this student's submissions for the plan's homework
  const homeworkIds = (homework || []).map((h: any) => h.id);
  let submissions: any[] = [];
  if (homeworkIds.length > 0) {
    const { data: subs, error: subError } = await supabase
      .from('nexus_homework_submissions')
      .select('*')
      .in('homework_id', homeworkIds)
      .eq('student_id', studentId);
    if (subError) throw subError;
    submissions = subs || [];
  }

  // Left join: attach submission to each homework item
  const submissionMap = new Map(submissions.map((s: any) => [s.homework_id, s]));
  const result = (homework || []).map((hw: any) => ({
    ...hw,
    submission: submissionMap.get(hw.id) || null,
  }));

  // Apply status filter if provided
  if (statusFilter) {
    if (statusFilter === 'pending') {
      return result.filter((hw: any) => !hw.submission || hw.submission.status === 'pending');
    }
    return result.filter((hw: any) => hw.submission?.status === statusFilter);
  }

  return result;
}
