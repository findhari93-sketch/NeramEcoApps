import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getLiveLeaderboard,
  getWeeklyLeaderboardSnapshot,
  getMonthlyLeaderboardSnapshot,
} from '@neram/database/queries/nexus';

/**
 * GET /api/gamification/leaderboard
 *
 * Params:
 *   period: 'weekly' | 'monthly' | 'alltime' (default: 'weekly')
 *   classroom_id: required
 *   batch_id: optional (filter within classroom)
 *   scope: 'batch' | 'all_neram' (default: 'batch')
 *   week: ISO date string for a specific week snapshot (optional)
 *   month: ISO date string for a specific month snapshot (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const params = request.nextUrl.searchParams;
    const period = params.get('period') || 'weekly';
    const classroomId = params.get('classroom_id');
    const batchId = params.get('batch_id') || undefined;
    const scope = (params.get('scope') || 'batch') as 'batch' | 'all_neram';

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: currentUser } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate date ranges
    const now = new Date();

    if (period === 'weekly') {
      const weekParam = params.get('week');
      if (weekParam) {
        // Historical snapshot
        const data = await getWeeklyLeaderboardSnapshot(weekParam, { classroomId, batchId });
        return NextResponse.json({ entries: data, period: 'weekly', week: weekParam });
      }

      // Live current week
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() + mondayOffset);
      const from = weekStart.toISOString().split('T')[0];
      const to = now.toISOString().split('T')[0];

      const entries = await getLiveLeaderboard(classroomId, { batchId, from, to, scope });
      const myRank = entries.find(e => e.student_id === currentUser.id) || null;

      return NextResponse.json({
        entries,
        myRank,
        period: 'weekly',
        from,
        to,
        totalStudents: entries.length,
      });
    }

    if (period === 'monthly') {
      const monthParam = params.get('month');
      if (monthParam) {
        const data = await getMonthlyLeaderboardSnapshot(monthParam, { classroomId, batchId });
        return NextResponse.json({ entries: data, period: 'monthly', month: monthParam });
      }

      // Live current month
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const to = now.toISOString().split('T')[0];

      const entries = await getLiveLeaderboard(classroomId, { batchId, from, to, scope });
      const myRank = entries.find(e => e.student_id === currentUser.id) || null;

      return NextResponse.json({
        entries,
        myRank,
        period: 'monthly',
        from,
        to,
        totalStudents: entries.length,
      });
    }

    if (period === 'alltime') {
      // All-time: aggregate all point events
      const entries = await getLiveLeaderboard(classroomId, {
        batchId,
        from: '2020-01-01',
        to: now.toISOString().split('T')[0],
        scope,
      });
      const myRank = entries.find(e => e.student_id === currentUser.id) || null;

      return NextResponse.json({
        entries,
        myRank,
        period: 'alltime',
        totalStudents: entries.length,
      });
    }

    return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load leaderboard';
    console.error('Leaderboard GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
