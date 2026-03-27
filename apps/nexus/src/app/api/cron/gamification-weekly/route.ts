import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getLiveLeaderboard } from '@neram/database/queries/nexus';

/**
 * GET /api/cron/gamification-weekly
 *
 * Runs every Sunday at 11:59 PM IST (6:29 PM UTC).
 * - Snapshots the weekly leaderboard for all classrooms
 * - Computes ranks, rank changes, Rising Stars, Comeback Kids
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient() as any;

    // Calculate this week's Monday
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = now.toISOString().split('T')[0];

    // Previous week for rank change calculation
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0];

    // Get all active classrooms
    const { data: classrooms } = await supabase
      .from('nexus_classrooms')
      .select('id')
      .eq('is_active', true);

    if (!classrooms || classrooms.length === 0) {
      return NextResponse.json({ message: 'No active classrooms', processed: 0 });
    }

    let totalProcessed = 0;

    for (const classroom of classrooms) {
      try {
        // Get live leaderboard for this week
        const entries = await getLiveLeaderboard(classroom.id, {
          from: weekStartStr,
          to: weekEndStr,
        });

        if (entries.length === 0) continue;

        // Get previous week's snapshot for rank change
        const { data: prevSnapshot } = await supabase
          .from('gamification_weekly_leaderboard')
          .select('student_id, rank_in_batch')
          .eq('classroom_id', classroom.id)
          .eq('week_start', prevWeekStartStr);

        const prevRankMap = new Map<string, number>();
        for (const row of prevSnapshot || []) {
          prevRankMap.set(row.student_id, row.rank_in_batch);
        }

        // Get attendance percentages for tiebreaker context
        const { data: enrollments } = await supabase
          .from('nexus_enrollments')
          .select('user_id, batch_id')
          .eq('classroom_id', classroom.id)
          .eq('role', 'student');

        const batchMap = new Map<string, string | null>();
        for (const e of enrollments || []) {
          batchMap.set(e.user_id, e.batch_id);
        }

        // Build snapshot records
        const records = entries.map((entry) => {
          const prevRank = prevRankMap.get(entry.student_id);
          const rankChange = prevRank ? prevRank - entry.rank : 0;
          const isRisingStar = rankChange >= 10;

          return {
            student_id: entry.student_id,
            classroom_id: classroom.id,
            batch_id: batchMap.get(entry.student_id) || null,
            week_start: weekStartStr,
            raw_score: entry.raw_score,
            normalized_score: entry.normalized_score,
            max_possible_score: 0,
            rank_in_batch: entry.rank,
            rank_all_neram: null,
            streak_length: entry.streak_length,
            attendance_pct: entry.attendance_pct,
            rank_change: rankChange,
            is_rising_star: isRisingStar,
            is_comeback_kid: false,
          };
        });

        // Upsert snapshot
        const { error } = await supabase
          .from('gamification_weekly_leaderboard')
          .upsert(records, { onConflict: 'student_id,week_start' });

        if (error) {
          console.error(`Weekly snapshot error for classroom ${classroom.id}:`, error.message);
        } else {
          totalProcessed += records.length;
        }
      } catch (err) {
        console.error(`Weekly cron error for classroom ${classroom.id}:`, err);
      }
    }

    return NextResponse.json({
      message: 'Weekly leaderboard snapshot completed',
      weekStart: weekStartStr,
      classrooms: classrooms.length,
      totalProcessed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Weekly cron failed';
    console.error('Gamification weekly cron error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
