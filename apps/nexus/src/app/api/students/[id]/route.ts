import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { getSupabaseAdminClient, getCurrentBatch, pairStatus } from '@neram/database';

/**
 * GET /api/students/[id]?classroom={id}
 *
 * Returns detailed student info: profile, attendance summary,
 * checklist progress, and topic progress.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    // Staff-only: any student's profile, phone, attendance and progress. Previously
    // authenticated but not authorised.
    assertCapability(caller, 'coord.student.view');

    const { id: studentId } = await params;
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Verify the student exists and is enrolled
    const [userResult, enrollmentResult] = await Promise.all([
      supabase
        .from('users')
        .select('id, name, email, avatar_url, phone, academic_year')
        .eq('id', studentId)
        .single(),

      supabase
        .from('nexus_enrollments')
        .select(
          'role, enrolled_at, current_standard, current_standard_source, current_standard_set_at, participation_status, dormant_since, dormant_reason',
        )
        .eq('classroom_id', classroomId)
        .eq('user_id', studentId)
        .eq('role', 'student')
        .single(),
    ]);

    if (userResult.error || !userResult.data) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (enrollmentResult.error || !enrollmentResult.data) {
      return NextResponse.json({ error: 'Student not enrolled in this classroom' }, { status: 404 });
    }

    // Fetch all stats in parallel
    const [
      attendanceRecordsResult,
      totalClassesResult,
      checklistItemsResult,
      checklistProgressResult,
      topicTotalResult,
      topicProgressResult,
    ] = await Promise.all([
      // Attendance records
      supabase
        .from('nexus_attendance')
        .select('id, attended, class:nexus_scheduled_classes(id, title, scheduled_date)')
        .eq('student_id', studentId),

      // Total completed classes
      supabase
        .from('nexus_scheduled_classes')
        .select('id', { count: 'exact', head: true })
        .eq('classroom_id', classroomId)
        .eq('status', 'completed'),

      // All checklist items
      supabase
        .from('nexus_checklist_items')
        .select('id, title, topic:nexus_topics(title, category)')
        .eq('classroom_id', classroomId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),

      // Student's checklist progress
      supabase
        .from('nexus_student_checklist_progress')
        .select('checklist_item_id, is_completed, completed_at')
        .eq('student_id', studentId),

      // Total topics
      supabase
        .from('nexus_topics')
        .select('id', { count: 'exact', head: true })
        .eq('classroom_id', classroomId)
        .eq('is_active', true),

      // Student topic progress
      supabase
        .from('nexus_student_topic_progress')
        .select('topic_id, status, completed_at')
        .eq('student_id', studentId)
        .eq('classroom_id', classroomId),
    ]);

    const totalClasses = totalClassesResult.count || 0;
    const attendedCount = (attendanceRecordsResult.data || []).filter((a) => a.attended).length;

    // Build checklist with progress
    const progressMap = new Map(
      (checklistProgressResult.data || []).map((p) => [p.checklist_item_id, p]),
    );

    const checklistItems = (checklistItemsResult.data || []).map((item) => {
      const progress = progressMap.get(item.id);
      return {
        ...item,
        is_completed: progress?.is_completed || false,
        completed_at: progress?.completed_at || null,
      };
    });

    const completedChecklist = checklistItems.filter((i) => i.is_completed).length;

    const enrollment = enrollmentResult.data as any;
    const user = userResult.data as any;
    const currentCode = (await getCurrentBatch())?.code ?? null;

    return NextResponse.json({
      student: {
        ...user,
        enrolled_at: enrollment.enrolled_at,
        // Two orthogonal axes: where they are in their studies, and whether they
        // are still participating. See migration 20260802090000.
        study_stage: enrollment.current_standard ?? null,
        study_stage_source: enrollment.current_standard_source ?? null,
        study_stage_set_at: enrollment.current_standard_set_at ?? null,
        participation_status: enrollment.participation_status ?? 'active',
        dormant_since: enrollment.dormant_since ?? null,
        dormant_reason: enrollment.dormant_reason ?? null,
        // Exam-year cohort, and whether it agrees with the class above. Set from
        // the same sheet, but stored on users, so it is global.
        academic_year: user.academic_year ?? null,
        pair_status: pairStatus(
          enrollment.current_standard ?? null,
          user.academic_year ?? null,
          currentCode ?? '',
        ),
      },
      currentBatch: currentCode,
      attendanceSummary: {
        total: totalClasses,
        attended: attendedCount,
        percentage: totalClasses > 0 ? Math.round((attendedCount / totalClasses) * 100) : 0,
        records: attendanceRecordsResult.data || [],
      },
      checklistProgress: {
        completed: completedChecklist,
        total: checklistItems.length,
        items: checklistItems,
      },
      topicProgress: {
        completed: (topicProgressResult.data || []).filter((t) => t.status === 'completed').length,
        total: topicTotalResult.count || 0,
        topics: topicProgressResult.data || [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load student details';
    console.error('Student detail error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
