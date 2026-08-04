import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  ensureCatchupJourney,
  getCatchupBacklog,
} from '@neram/database';
import { computeCatchupPace, describeCatchupPace } from '@/lib/catchup-pace';

/**
 * GET /api/student/catchup-journey
 *
 * The whole catch-up screen in one payload: the backlog, where each item stands,
 * and how the student is doing against their weekly quota. One call rather than
 * four, because this is the first thing a newcomer sees and every extra round
 * trip is a Vercel function invocation plus a spinner on a phone.
 *
 * Not to be confused with /api/student/catchup, which is the older topic-level
 * catch-up track shared per teaching plan.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // The caller passes their active classroom; fall back to their enrolment so
    // the page works on a cold load before the classroom context has resolved.
    const requested = request.nextUrl.searchParams.get('classroom');
    let classroomId = requested;
    if (!classroomId) {
      const { data: enrollment } = await supabase
        .from('nexus_enrollments')
        .select('classroom_id')
        .eq('user_id', user.id)
        .eq('role', 'student')
        .eq('is_active', true)
        .order('enrolled_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      classroomId = enrollment?.classroom_id || null;
    }
    if (!classroomId) {
      return NextResponse.json({ journey: null, pace: null, items: [], excluded: [], totals: null });
    }

    const empty = {
      journey: null,
      pace: null,
      items: [],
      missed: [],
      excluded: [],
      totals: null,
      missedTotals: { total: 0, completed: 0, open: 0, overdue: 0 },
    };

    // Self-heal, same reasoning as the per-class route: a student enrolled a
    // minute ago should not be told to come back after the weekly sweep.
    let backlog = await getCatchupBacklog(user.id, classroomId, supabase);
    if (!backlog) {
      await ensureCatchupJourney(user.id, classroomId, {}, supabase);
      backlog = await getCatchupBacklog(user.id, classroomId, supabase);
    }
    if (!backlog) return NextResponse.json(empty);

    const { journey, missed, totals, missedTotals } = backlog;

    // Pace belongs to the journey, and only a late joiner has one. It is a
    // gentle "you are roughly here" for the whole backlog, and it is NOT a
    // deadline: the only deadline a student has is the clock on the one class
    // they started.
    const quota = journey?.weekly_quota ?? 2;
    const pace = journey
      ? computeCatchupPace({
          started_on: journey.started_on,
          weekly_quota: quota,
          total_items: totals.total,
          completed_items: totals.completed,
        })
      : null;

    // Classes nobody can do anything about are listed separately rather than
    // padding either list with rows that have no action on them.
    const blocked = backlog.items.filter((i) => i.status === 'blocked');
    const paced = backlog.backlog.filter((i) => i.status !== 'blocked');

    return NextResponse.json({
      journey: journey
        ? {
            id: journey.id,
            started_on: journey.started_on,
            weekly_quota: quota,
            status: journey.status,
          }
        : null,
      pace: pace ? { ...pace, message: describeCatchupPace(pace, quota) } : null,
      totals,
      missedTotals,
      clock: backlog.clock,
      windows: backlog.windows,
      // Missed classes first in the payload as well as on the screen, because a
      // class the course has already built on matters more than one taught
      // before the student existed here.
      missed: missed.filter((i) => i.status !== 'blocked'),
      // No due_on override any more. It used to stamp a quota deadline over
      // every backlog item, so a late joiner's card carried a date they had
      // never agreed to and which competed with the real clock. The only
      // deadline is the one the student started.
      items: paced,
      excluded: blocked.map((i) => ({
        id: i.id,
        scheduled_class_id: i.scheduled_class_id,
        class: i.class,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your catch-up list';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
