import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/parent/progress?classroom={id}
 * Returns the linked child's progress summary for the parent dashboard.
 * Parent must be linked via nexus_parent_links.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Find parent user
    const { data: parentUser } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!parentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find linked student via nexus_parent_links (no classroom_id on this table)
    const { data: parentLink } = await supabase
      .from('nexus_parent_links')
      .select('student_user_id, student:users!nexus_parent_links_student_user_id_fkey(id, name, email, avatar_url)')
      .eq('parent_user_id', parentUser.id)
      .eq('is_active', true)
      .single();

    if (!parentLink) {
      return NextResponse.json({
        error: 'No linked student found',
        child: null,
        attendance: null,
        checklist: null,
        drawings: null,
        upcomingClasses: [],
      });
    }

    const studentId = parentLink.student_user_id;
    const child = parentLink.student as any;

    // Fetch attendance summary (join via scheduled_class to filter by classroom)
    const { count: totalClasses } = await supabase
      .from('nexus_attendance')
      .select('*, scheduled_class:nexus_scheduled_classes!inner(classroom_id)', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('nexus_scheduled_classes.classroom_id', classroomId);

    const { count: presentCount } = await supabase
      .from('nexus_attendance')
      .select('*, scheduled_class:nexus_scheduled_classes!inner(classroom_id)', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('nexus_scheduled_classes.classroom_id', classroomId)
      .eq('attended', true);

    // Fetch checklist progress
    const { count: totalChecklist } = await supabase
      .from('nexus_checklist_items')
      .select('*', { count: 'exact', head: true })
      .eq('classroom_id', classroomId)
      .eq('is_active', true);

    const { count: completedChecklist } = await supabase
      .from('nexus_student_checklist_progress')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('is_completed', true);

    // Fetch drawing progress
    const { count: totalExercises } = await supabase
      .from('nexus_drawing_exercises')
      .select('*, category:nexus_drawing_categories!inner(level:nexus_drawing_levels!inner(classroom_id))', { count: 'exact', head: true })
      .eq('nexus_drawing_categories.nexus_drawing_levels.classroom_id', classroomId)
      .eq('is_active', true);

    const { count: approvedExercises } = await supabase
      .from('nexus_drawing_submissions')
      .select('*, exercise:nexus_drawing_exercises!inner(category:nexus_drawing_categories!inner(level:nexus_drawing_levels!inner(classroom_id)))', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('status', 'approved')
      .eq('nexus_drawing_exercises.nexus_drawing_categories.nexus_drawing_levels.classroom_id', classroomId);

    // Fetch upcoming classes (next 7 days)
    const now = new Date();
    const weekLater = new Date();
    weekLater.setDate(weekLater.getDate() + 7);

    const { data: upcomingClasses } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, start_time, end_time, meeting_url')
      .eq('classroom_id', classroomId)
      .gte('start_time', now.toISOString())
      .lte('start_time', weekLater.toISOString())
      .order('start_time', { ascending: true })
      .limit(10);

    return NextResponse.json({
      child: {
        id: child?.id,
        name: child?.name || 'Student',
        avatar_url: child?.avatar_url,
      },
      attendance: {
        total: totalClasses || 0,
        present: presentCount || 0,
        percentage: totalClasses ? Math.round(((presentCount || 0) / totalClasses) * 100) : 0,
      },
      checklist: {
        total: totalChecklist || 0,
        completed: completedChecklist || 0,
        percentage: totalChecklist ? Math.round(((completedChecklist || 0) / totalChecklist) * 100) : 0,
      },
      drawings: {
        total: totalExercises || 0,
        approved: approvedExercises || 0,
        percentage: totalExercises ? Math.round(((approvedExercises || 0) / totalExercises) * 100) : 0,
      },
      upcomingClasses: upcomingClasses || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load progress';
    console.error('Parent progress GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
