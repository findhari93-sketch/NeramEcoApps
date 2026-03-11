import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

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
    await verifyMsToken(request.headers.get('Authorization'));

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
        .select('id, name, email, avatar_url, phone')
        .eq('id', studentId)
        .single(),

      supabase
        .from('nexus_enrollments')
        .select('role, enrolled_at')
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

    return NextResponse.json({
      student: {
        ...userResult.data,
        enrolled_at: enrollmentResult.data.enrolled_at,
      },
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
