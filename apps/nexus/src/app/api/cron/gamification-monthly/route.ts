import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getLiveLeaderboard } from '@neram/database/queries/nexus';

/**
 * GET /api/cron/gamification-monthly
 *
 * Runs on the 1st of each month at midnight IST (6:30 PM UTC prev day).
 * - Snapshots the monthly leaderboard for all classrooms
 * - Computes monthly ranks and badge counts
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient() as any;

    // Previous month (since this runs on the 1st)
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStartStr = prevMonth.toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    // Previous month for rank change
    const prevPrevMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth() - 1, 1);
    const prevMonthStartStr = prevPrevMonth.toISOString().split('T')[0];

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
        const entries = await getLiveLeaderboard(classroom.id, {
          from: monthStartStr,
          to: monthEndStr,
        });

        if (entries.length === 0) continue;

        // Get previous month's snapshot for rank change
        const { data: prevSnapshot } = await supabase
          .from('gamification_monthly_leaderboard')
          .select('student_id, rank_in_batch')
          .eq('classroom_id', classroom.id)
          .eq('month_start', prevMonthStartStr);

        const prevRankMap = new Map<string, number>();
        for (const row of prevSnapshot || []) {
          prevRankMap.set(row.student_id, row.rank_in_batch);
        }

        // Get badge counts for the month
        const studentIds = entries.map(e => e.student_id);
        const { data: badgeCounts } = await supabase
          .from('gamification_student_badges')
          .select('student_id')
          .in('student_id', studentIds)
          .gte('earned_at', monthStartStr)
          .lte('earned_at', monthEndStr + 'T23:59:59Z');

        const badgeCountMap = new Map<string, number>();
        for (const row of badgeCounts || []) {
          badgeCountMap.set(row.student_id, (badgeCountMap.get(row.student_id) || 0) + 1);
        }

        // Get enrollments for batch info
        const { data: enrollments } = await supabase
          .from('nexus_enrollments')
          .select('user_id, batch_id')
          .eq('classroom_id', classroom.id)
          .eq('role', 'student');

        const batchMap = new Map<string, string | null>();
        for (const e of enrollments || []) {
          batchMap.set(e.user_id, e.batch_id);
        }

        const records = entries.map((entry) => {
          const prevRank = prevRankMap.get(entry.student_id);
          const rankChange = prevRank ? prevRank - entry.rank : 0;

          return {
            student_id: entry.student_id,
            classroom_id: classroom.id,
            batch_id: batchMap.get(entry.student_id) || null,
            month_start: monthStartStr,
            raw_score: entry.raw_score,
            normalized_score: entry.normalized_score,
            max_possible_score: 0,
            rank_in_batch: entry.rank,
            rank_all_neram: null,
            streak_length: entry.streak_length,
            attendance_pct: entry.attendance_pct,
            rank_change: rankChange,
            badges_earned_this_month: badgeCountMap.get(entry.student_id) || 0,
            is_rising_star: rankChange >= 10,
            is_comeback_kid: false,
          };
        });

        const { error } = await supabase
          .from('gamification_monthly_leaderboard')
          .upsert(records, { onConflict: 'student_id,month_start' });

        if (error) {
          console.error(`Monthly snapshot error for classroom ${classroom.id}:`, error.message);
        } else {
          totalProcessed += records.length;
        }
      } catch (err) {
        console.error(`Monthly cron error for classroom ${classroom.id}:`, err);
      }
    }

    return NextResponse.json({
      message: 'Monthly leaderboard snapshot completed',
      monthStart: monthStartStr,
      classrooms: classrooms.length,
      totalProcessed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Monthly cron failed';
    console.error('Gamification monthly cron error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
