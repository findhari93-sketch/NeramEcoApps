import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  updateStudentStreak,
  recordPointEvent,
  checkStreakMilestones,
  checkAndAwardBadges,
} from '@neram/database/queries/nexus';

/**
 * GET /api/cron/gamification-nightly
 *
 * Runs daily at 11:30 PM IST (6:00 PM UTC).
 * - Awards streak_day points (3pts) for students active today
 * - Updates streaks for students with gaps (resets if missed a day)
 * - Checks streak milestones (7/30/90 day bonuses)
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const today = new Date().toISOString().split('T')[0];

    // Find all students who had activity today (have point events today)
    const { data: activeToday } = await supabase
      .from('gamification_point_events')
      .select('student_id, classroom_id, batch_id')
      .eq('event_date', today)
      .neq('event_type', 'streak_day')
      .neq('event_type', 'streak_milestone');

    if (!activeToday || activeToday.length === 0) {
      return NextResponse.json({ message: 'No active students today', processed: 0 });
    }

    // Deduplicate by student
    const studentMap = new Map<string, { classroom_id: string; batch_id: string | null }>();
    for (const row of activeToday) {
      if (!studentMap.has(row.student_id)) {
        studentMap.set(row.student_id, {
          classroom_id: row.classroom_id,
          batch_id: row.batch_id,
        });
      }
    }

    let processed = 0;
    const errors: string[] = [];

    for (const [studentId, ctx] of studentMap.entries()) {
      try {
        // Update streak
        const streak = await updateStudentStreak(studentId, today);

        // Award streak_day points (3pts)
        await recordPointEvent({
          student_id: studentId,
          classroom_id: ctx.classroom_id,
          batch_id: ctx.batch_id,
          event_type: 'streak_day',
          points: 3,
          source_id: `streak_day_${studentId}_${today}`,
          event_date: today,
          metadata: { streak_length: streak.current_streak },
        });

        // Check milestones
        await checkStreakMilestones(
          studentId,
          ctx.classroom_id,
          ctx.batch_id,
          streak.current_streak
        );

        // Check badge criteria
        await checkAndAwardBadges(studentId);

        processed++;
      } catch (err) {
        errors.push(`${studentId}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    return NextResponse.json({
      message: `Nightly gamification cron completed`,
      processed,
      total: studentMap.size,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gamification nightly cron failed';
    console.error('Gamification nightly cron error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
