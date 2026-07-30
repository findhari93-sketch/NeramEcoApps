import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { getSupabaseAdminClient } from '@neram/database';
import { istToday } from '@/lib/plan-flow';
import { resolveExamCountdown } from '@/lib/exam-countdown-server';

/**
 * GET /api/dashboard/teacher?classroom={id}
 *
 * Returns teacher dashboard data: today's classes, student count,
 * attendance stats, pending tickets, and the exam countdown for this classroom.
 */
export async function GET(request: NextRequest) {
  try {
    // Staff-only: the teacher dashboard payload for an arbitrary classroom id.
    // Previously the token was verified but the role never checked, so a
    // student's token returned the staff dashboard for any classroom.
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(user, 'report.view');

    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // IST, not UTC. toISOString().split('T')[0] is a day behind between 00:00
    // and 05:30 IST, so "Classes Today" showed yesterday's list to anyone opening
    // the dashboard late at night.
    const today = istToday();

    const [
      todayClassesResult,
      studentCountResult,
      pendingTicketsResult,
      examCountdown,
    ] = await Promise.all([
      // Today's classes
      supabase
        .from('nexus_scheduled_classes')
        .select('id, title, start_time, end_time, status, teams_meeting_url, topic:nexus_topics(title)')
        .eq('classroom_id', classroomId)
        .eq('scheduled_date', today)
        .order('start_time', { ascending: true }),

      // Student count. Dormant students are excluded so this headline number
      // agrees with the "N tracked" figure on the students screen and with the
      // denominator of every rate on this dashboard.
      supabase
        .from('nexus_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('classroom_id', classroomId)
        .eq('role', 'student')
        .eq('is_active', true)
        .eq('participation_status', 'active'),

      // Pending tickets (from existing support_tickets table)
      supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .in('status', ['open', 'in_progress']),

      // Days left until this classroom's target exam. studentId null: a teacher
      // sees the cohort date, never a particular student's booked slot.
      resolveExamCountdown(supabase, { classroomId, studentId: null }),
    ]);

    return NextResponse.json({
      todayClasses: todayClassesResult.data || [],
      studentCount: studentCountResult.count || 0,
      attendanceTodayCount: 0, // Will be populated when attendance is recorded
      pendingTickets: pendingTicketsResult.count || 0,
      examCountdown,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard';
    console.error('Teacher dashboard error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
