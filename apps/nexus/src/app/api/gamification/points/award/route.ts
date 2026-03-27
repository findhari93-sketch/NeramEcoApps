import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { recordGamificationEvent } from '@neram/database/queries/nexus';

/**
 * POST /api/gamification/points/award
 *
 * Teacher awards manual points to a student.
 * Body: { student_id, classroom_id, points, reason }
 * Capped at 50 manual points per student per week.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes((user as any).user_type)) {
      return NextResponse.json({ error: 'Only teachers can award points' }, { status: 403 });
    }

    const body = await request.json();
    const { student_id, classroom_id, points, reason } = body;

    if (!student_id || !classroom_id || !points || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: student_id, classroom_id, points, reason' },
        { status: 400 }
      );
    }

    if (points < 1 || points > 20) {
      return NextResponse.json(
        { error: 'Points must be between 1 and 20 per award' },
        { status: 400 }
      );
    }

    // Check weekly cap: max 50 manual points per student per week
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    const from = weekStart.toISOString().split('T')[0];

    const { data: existingManual } = await supabase
      .from('gamification_point_events')
      .select('points')
      .eq('student_id', student_id)
      .in('event_type', ['manual_teacher_award', 'peer_help'])
      .gte('event_date', from);

    const weeklyTotal = (existingManual || []).reduce((sum: number, r: any) => sum + r.points, 0);
    if (weeklyTotal + points > 50) {
      return NextResponse.json(
        { error: `Weekly manual points cap reached. Used ${weeklyTotal}/50 this week.` },
        { status: 400 }
      );
    }

    // Get batch_id
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('batch_id')
      .eq('user_id', student_id)
      .eq('classroom_id', classroom_id)
      .single();

    const sourceId = `manual_${user.id}_${student_id}_${Date.now()}`;

    await recordGamificationEvent({
      student_id,
      classroom_id,
      batch_id: (enrollment as any)?.batch_id || null,
      event_type: 'manual_teacher_award',
      points,
      source_id: sourceId,
      activity_type: 'manual_award',
      activity_title: `Teacher awarded ${points} points: ${reason}`,
      metadata: { reason, awarded_by: user.id },
    });

    return NextResponse.json({ success: true, points_awarded: points });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to award points';
    console.error('Award points error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
