import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { RemovalReasonCategory, ProgressSnapshot, HistoricalStudent } from '../../types';
import { getStudentAttendanceSummary } from './attendance';
import { getClassroomProgressSummary } from './progress';

export async function getProgressSnapshotForStudent(
  studentId: string,
  classroomId: string,
  enrolledAt: string,
  batchName: string | null,
  client?: TypedSupabaseClient
): Promise<ProgressSnapshot> {
  const supabase = client || getSupabaseAdminClient();

  const [attendance, progressSummary] = await Promise.all([
    getStudentAttendanceSummary(studentId, classroomId, supabase),
    getClassroomProgressSummary(classroomId, supabase),
  ]);

  // Count completed topics
  const { count: completedTopics } = await supabase
    .from('nexus_student_topic_progress')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('classroom_id', classroomId)
    .eq('status', 'completed');

  // Count completed checklist items
  const { count: completedChecklist } = await supabase
    .from('nexus_student_checklist_progress')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('is_completed', true);

  return {
    attendance,
    checklist: { completed: completedChecklist || 0, total: progressSummary.totalChecklist },
    topics: { completed: completedTopics || 0, total: progressSummary.totalTopics },
    batch_name: batchName,
    enrolled_at: enrolledAt,
    removed_at: new Date().toISOString(),
  };
}

export async function removeEnrollments(
  enrollmentIds: string[],
  classroomId: string,
  removedBy: string,
  reasonCategory: RemovalReasonCategory,
  notes: string | null,
  client?: TypedSupabaseClient
): Promise<number> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  // Fetch enrollments with user/batch info
  const { data: enrollments, error: fetchErr } = await supabase
    .from('nexus_enrollments')
    .select('id, user_id, enrolled_at, batch:nexus_batches(name)')
    .in('id', enrollmentIds)
    .eq('classroom_id', classroomId)
    .eq('is_active', true);

  if (fetchErr) throw fetchErr;
  if (!enrollments || enrollments.length === 0) return 0;

  // Build progress snapshots for each student
  const snapshots = await Promise.all(
    enrollments.map(async (e: any) => ({
      enrollment_id: e.id,
      user_id: e.user_id,
      snapshot: await getProgressSnapshotForStudent(
        e.user_id,
        classroomId,
        e.enrolled_at,
        e.batch?.name || null,
        supabase
      ),
    }))
  );

  // Soft-delete enrollments
  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('nexus_enrollments')
    .update({
      is_active: false,
      removed_at: now,
      removed_by: removedBy,
      removal_reason_category: reasonCategory,
      removal_notes: notes,
    })
    .in('id', enrollmentIds);

  if (updateErr) throw updateErr;

  // Insert history rows
  const historyRows = snapshots.map((s) => ({
    enrollment_id: s.enrollment_id,
    classroom_id: classroomId,
    user_id: s.user_id,
    action: 'removed',
    reason_category: reasonCategory,
    notes,
    performed_by: removedBy,
    progress_snapshot: s.snapshot,
  }));

  const { error: histErr } = await supabase
    .from('nexus_enrollment_history')
    .insert(historyRows);

  if (histErr) throw histErr;

  return enrollments.length;
}

export async function getHistoricalStudents(
  classroomId: string,
  filters: { reasonCategory?: string; search?: string; page?: number; limit?: number },
  client?: TypedSupabaseClient
): Promise<{ students: HistoricalStudent[]; total: number }> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;

  // Query inactive student enrollments
  let query = supabase
    .from('nexus_enrollments')
    .select(
      'id, user_id, enrolled_at, removed_at, removed_by, removal_reason_category, removal_notes, batch:nexus_batches(name), user:users(id, name, email, avatar_url), remover:users!nexus_enrollments_removed_by_fkey(id, name)',
      { count: 'exact' }
    )
    .eq('classroom_id', classroomId)
    .eq('is_active', false)
    .eq('role', 'student')
    .not('removed_at', 'is', null);

  if (filters.reasonCategory) {
    query = query.eq('removal_reason_category', filters.reasonCategory);
  }

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`, { referencedTable: 'users' });
  }

  query = query.order('removed_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  // Fetch progress snapshots from history table
  const enrollmentIds = (data || []).map((d: any) => d.id);
  let snapshotMap: Record<string, any> = {};

  if (enrollmentIds.length > 0) {
    const { data: historyRows } = await supabase
      .from('nexus_enrollment_history')
      .select('enrollment_id, progress_snapshot')
      .in('enrollment_id', enrollmentIds)
      .eq('action', 'removed')
      .order('created_at', { ascending: false });

    if (historyRows) {
      for (const row of historyRows) {
        if (!snapshotMap[row.enrollment_id]) {
          snapshotMap[row.enrollment_id] = row.progress_snapshot;
        }
      }
    }
  }

  const students: HistoricalStudent[] = (data || []).map((d: any) => ({
    enrollment_id: d.id,
    user: d.user,
    batch_name: d.batch?.name || null,
    enrolled_at: d.enrolled_at,
    removed_at: d.removed_at,
    removed_by: d.remover || { id: d.removed_by, name: 'Unknown' },
    reason_category: d.removal_reason_category,
    notes: d.removal_notes,
    progress_snapshot: snapshotMap[d.id] || null,
  }));

  return { students, total: count || 0 };
}

export async function restoreEnrollment(
  enrollmentId: string,
  restoredBy: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  // Get enrollment info
  const { data: enrollment, error: fetchErr } = await supabase
    .from('nexus_enrollments')
    .select('id, user_id, classroom_id')
    .eq('id', enrollmentId)
    .eq('is_active', false)
    .single();

  if (fetchErr) throw fetchErr;
  if (!enrollment) throw new Error('Enrollment not found or already active');

  // Re-activate
  const { error: updateErr } = await supabase
    .from('nexus_enrollments')
    .update({
      is_active: true,
      removed_at: null,
      removed_by: null,
      removal_reason_category: null,
      removal_notes: null,
    })
    .eq('id', enrollmentId);

  if (updateErr) throw updateErr;

  // Insert history row
  const { error: histErr } = await supabase
    .from('nexus_enrollment_history')
    .insert({
      enrollment_id: enrollmentId,
      classroom_id: enrollment.classroom_id,
      user_id: enrollment.user_id,
      action: 'restored',
      performed_by: restoredBy,
    });

  if (histErr) throw histErr;
}
