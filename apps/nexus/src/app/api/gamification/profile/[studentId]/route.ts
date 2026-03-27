import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getStudentBadges,
  getStudentStreak,
  getStudentActivityLog,
  getStudentPointBreakdown,
} from '@neram/database/queries/nexus';

/**
 * GET /api/gamification/profile/{studentId}
 *
 * Returns a student's achievement profile (public view).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { studentId } = await params;

    const supabase = getSupabaseAdminClient() as any;

    // Get current user for self-view detection
    const { data: currentUser } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    const isSelf = currentUser?.id === studentId;

    // Get student info
    const { data: student } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .eq('id', studentId)
      .single();

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Get enrollment info
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('classroom_id, batch_id, classroom:nexus_classrooms(name), batch:nexus_batches(name)')
      .eq('user_id', studentId)
      .eq('role', 'student')
      .limit(1)
      .single();

    // Parallel data fetching
    const [badges, streak, activity] = await Promise.all([
      getStudentBadges(studentId),
      getStudentStreak(studentId),
      getStudentActivityLog(studentId, 20),
    ]);

    // Attendance stats
    const { count: totalClasses } = await supabase
      .from('nexus_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId);

    const { count: attendedClasses } = await supabase
      .from('nexus_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('attended', true);

    const total = totalClasses || 0;
    const attended = attendedClasses || 0;
    const attendancePct = total > 0 ? Math.round((attended / total) * 100) : 0;

    // Checklist completion count
    const { count: checklistsCompleted } = await supabase
      .from('nexus_student_entry_progress')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('status', 'completed');

    // Monthly attendance heatmap (current month)
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const { data: monthlyAttendance } = await supabase
      .from('nexus_attendance')
      .select('scheduled_class:nexus_scheduled_classes(start_time), attended')
      .eq('student_id', studentId)
      .gte('nexus_scheduled_classes.start_time', monthStart);

    const heatmap = (monthlyAttendance || []).map((r: any) => ({
      date: r.scheduled_class?.start_time?.split('T')[0] || '',
      attended: r.attended,
    }));

    const profile: any = {
      student_id: studentId,
      student_name: (student as any).name,
      avatar_url: (student as any).avatar_url,
      batch_name: (enrollment as any)?.batch?.name || null,
      classroom_name: (enrollment as any)?.classroom?.name || null,
      streak: streak,
      attendance_pct: attendancePct,
      total_checklists_completed: checklistsCompleted || 0,
      total_badges: badges.length,
      badges,
      recent_activity: activity,
      attendance_heatmap: heatmap,
    };

    // Self-view extras
    if (isSelf) {
      const weekStart = new Date(now);
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      weekStart.setDate(now.getDate() + mondayOffset);
      const from = weekStart.toISOString().split('T')[0];
      const to = now.toISOString().split('T')[0];

      const pointBreakdown = await getStudentPointBreakdown(studentId, from, to);

      // Rank history (last 8 weeks)
      const { data: rankHistory } = await supabase
        .from('gamification_weekly_leaderboard')
        .select('week_start, rank_in_batch, raw_score')
        .eq('student_id', studentId)
        .order('week_start', { ascending: false })
        .limit(8);

      profile.points_breakdown = pointBreakdown;
      profile.rank_history = (rankHistory || []).reverse();
      profile.is_self = true;
    }

    return NextResponse.json(profile);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load profile';
    console.error('Profile GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
