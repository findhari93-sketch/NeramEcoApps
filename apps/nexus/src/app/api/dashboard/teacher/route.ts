import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/dashboard/teacher?classroom={id}
 *
 * Returns teacher dashboard data: today's classes, student count,
 * attendance stats, and pending tickets.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const today = new Date().toISOString().split('T')[0];

    const [
      todayClassesResult,
      studentCountResult,
      pendingTicketsResult,
    ] = await Promise.all([
      // Today's classes
      supabase
        .from('nexus_scheduled_classes')
        .select('id, title, start_time, end_time, status, teams_meeting_url, topic:nexus_topics(title)')
        .eq('classroom_id', classroomId)
        .eq('scheduled_date', today)
        .order('start_time', { ascending: true }),

      // Student count
      supabase
        .from('nexus_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('classroom_id', classroomId)
        .eq('role', 'student')
        .eq('is_active', true),

      // Pending tickets (from existing support_tickets table)
      supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .in('status', ['open', 'in_progress']),
    ]);

    return NextResponse.json({
      todayClasses: todayClassesResult.data || [],
      studentCount: studentCountResult.count || 0,
      attendanceTodayCount: 0, // Will be populated when attendance is recorded
      pendingTickets: pendingTicketsResult.count || 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard';
    console.error('Teacher dashboard error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
