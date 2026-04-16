import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/dashboard/student?classroom={id}
 *
 * Returns student dashboard data: upcoming classes, attendance summary,
 * checklist progress, and topic progress.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Get user by MS OID
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Compute "now" in IST (Asia/Kolkata, UTC+5:30) so time filtering
    // works correctly on Vercel's UTC servers.
    const now = new Date();
    const istNow = new Date(now.getTime() + (5.5 * 60 + now.getTimezoneOffset()) * 60 * 1000);
    const today = istNow.toISOString().split('T')[0];
    const nowTimeHHMM = istNow.toTimeString().slice(0, 5); // "HH:MM"

    // Fetch all data in parallel
    const [
      upcomingClassesRaw,
      attendanceResult,
      completedClassesCountResult,
      recentCompletedResult,
      checklistTotalResult,
      checklistCompletedResult,
      topicTotalResult,
      topicCompletedResult,
    ] = await Promise.all([
      // Upcoming classes (over-fetch to filter today's ended classes in JS)
      supabase
        .from('nexus_scheduled_classes')
        .select('id, title, scheduled_date, start_time, end_time, status, teams_meeting_url, topic:nexus_topics(title, category), teacher:users!nexus_scheduled_classes_teacher_id_fkey(name)')
        .eq('classroom_id', classroomId)
        .gte('scheduled_date', today)
        .in('status', ['scheduled', 'live'])
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(10),

      // Attendance: classes attended
      supabase
        .from('nexus_attendance')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .eq('attended', true),

      // Total completed classes in classroom (for attendance %)
      supabase
        .from('nexus_scheduled_classes')
        .select('id', { count: 'exact', head: true })
        .eq('classroom_id', classroomId)
        .eq('status', 'completed'),

      // Recent completed classes with recordings (for dashboard section)
      supabase
        .from('nexus_scheduled_classes')
        .select('id, title, scheduled_date, start_time, end_time, status, recording_url, topic:nexus_topics(title, category), teacher:users!nexus_scheduled_classes_teacher_id_fkey(name)')
        .eq('classroom_id', classroomId)
        .eq('status', 'completed')
        .order('scheduled_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(5),

      // Total checklist items
      supabase
        .from('nexus_checklist_items')
        .select('id', { count: 'exact', head: true })
        .eq('classroom_id', classroomId)
        .eq('is_active', true),

      // Completed checklist items
      supabase
        .from('nexus_student_checklist_progress')
        .select('id, checklist_item:nexus_checklist_items!inner(classroom_id)', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .eq('is_completed', true)
        .eq('nexus_checklist_items.classroom_id', classroomId),

      // Total topics
      supabase
        .from('nexus_topics')
        .select('id', { count: 'exact', head: true })
        .eq('classroom_id', classroomId)
        .eq('is_active', true),

      // Completed topics
      supabase
        .from('nexus_student_topic_progress')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .eq('classroom_id', classroomId)
        .eq('status', 'completed'),
    ]);

    // Filter out today's classes whose end_time has already passed
    const upcomingClasses = (upcomingClassesRaw.data || []).filter((cls) => {
      if (cls.scheduled_date > today) return true;
      return cls.end_time > nowTimeHHMM;
    }).slice(0, 5);

    const totalClasses = completedClassesCountResult.count || 0;
    const attendedClasses = attendanceResult.count || 0;

    return NextResponse.json({
      upcomingClasses,
      completedClasses: recentCompletedResult.data || [],
      attendanceSummary: {
        total: totalClasses,
        attended: attendedClasses,
        percentage: totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 0,
      },
      checklistProgress: {
        completed: checklistCompletedResult.count || 0,
        total: checklistTotalResult.count || 0,
      },
      topicProgress: {
        completed: topicCompletedResult.count || 0,
        total: topicTotalResult.count || 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard';
    console.error('Dashboard error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
