import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/students?classroom={id}&search={query}
 *
 * List enrolled students for a classroom with attendance and checklist stats.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const classroomId = request.nextUrl.searchParams.get('classroom');
    const search = request.nextUrl.searchParams.get('search');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Get student enrollments with user info
    let enrollmentQuery = supabase
      .from('nexus_enrollments')
      .select('user_id, enrolled_at, user:users!inner(id, name, email, avatar_url)')
      .eq('classroom_id', classroomId)
      .eq('role', 'student');

    if (search) {
      enrollmentQuery = enrollmentQuery.ilike('users.name', `%${search}%`);
    }

    const { data: enrollments, error: enrollmentError } = await enrollmentQuery;

    if (enrollmentError) throw enrollmentError;

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ students: [] });
    }

    const studentIds = enrollments.map((e) => e.user_id);

    // Fetch stats in parallel
    const [attendanceResult, totalClassesResult, checklistTotalResult, checklistProgressResult] =
      await Promise.all([
        // Attendance records for all students in this classroom's classes
        supabase
          .from('nexus_attendance')
          .select('student_id, attended')
          .in('student_id', studentIds),

        // Total completed classes in classroom
        supabase
          .from('nexus_scheduled_classes')
          .select('id', { count: 'exact', head: true })
          .eq('classroom_id', classroomId)
          .eq('status', 'completed'),

        // Total active checklist items
        supabase
          .from('nexus_checklist_items')
          .select('id', { count: 'exact', head: true })
          .eq('classroom_id', classroomId)
          .eq('is_active', true),

        // Checklist progress for all students
        supabase
          .from('nexus_student_checklist_progress')
          .select('student_id, checklist_item:nexus_checklist_items!inner(classroom_id)')
          .in('student_id', studentIds)
          .eq('is_completed', true)
          .eq('nexus_checklist_items.classroom_id', classroomId),
      ]);

    if (attendanceResult.error) throw attendanceResult.error;
    if (totalClassesResult.error) throw totalClassesResult.error;
    if (checklistTotalResult.error) throw checklistTotalResult.error;
    if (checklistProgressResult.error) throw checklistProgressResult.error;

    const totalClasses = totalClassesResult.count || 0;
    const totalChecklistItems = checklistTotalResult.count || 0;

    // Build attendance stats per student
    const attendanceByStudent = (attendanceResult.data || []).reduce(
      (acc: Record<string, { attended: number; total: number }>, row) => {
        if (!acc[row.student_id]) acc[row.student_id] = { attended: 0, total: 0 };
        acc[row.student_id].total += 1;
        if (row.attended) acc[row.student_id].attended += 1;
        return acc;
      },
      {} as Record<string, { attended: number; total: number }>,
    );

    // Build checklist stats per student
    const checklistByStudent = (checklistProgressResult.data || []).reduce(
      (acc: Record<string, number>, row) => {
        acc[row.student_id] = (acc[row.student_id] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const students = enrollments.map((enrollment) => {
      const userId = enrollment.user_id;
      const user = enrollment.user as unknown as {
        id: string;
        name: string;
        email: string;
        avatar_url: string | null;
      };
      const attendance = attendanceByStudent[userId] || { attended: 0, total: 0 };

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url,
        enrolled_at: enrollment.enrolled_at,
        attendance: {
          attended: attendance.attended,
          total: totalClasses,
          percentage:
            totalClasses > 0 ? Math.round((attendance.attended / totalClasses) * 100) : 0,
        },
        checklist: {
          completed: checklistByStudent[userId] || 0,
          total: totalChecklistItems,
        },
      };
    });

    return NextResponse.json({ students });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load students';
    console.error('Students GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
