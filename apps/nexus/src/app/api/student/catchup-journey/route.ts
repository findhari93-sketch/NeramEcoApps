import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  ensureCatchupJourney,
  getCatchupBacklog,
} from '@neram/database';
import { computeCatchupPace, describeCatchupPace } from '@/lib/catchup-pace';
import { listRewatchableRecaps } from '@/lib/rewatchable-recaps';

/**
 * GET /api/student/catchup-journey
 *
 * The whole catch-up screen in one payload: the backlog, where each item stands,
 * how the student is doing against their weekly quota, and the classes they may
 * simply watch again. One call rather than four, because this is the first thing
 * a newcomer sees and every extra round trip is a Vercel function invocation
 * plus a spinner on a phone.
 *
 * `rewatchable` is the second tab of that screen, and it is built here rather
 * than behind its own route for a reason beyond the invocation count: it is
 * defined as the classroom's recaps MINUS whatever this same request has just
 * found to be outstanding. Computed in one place, off one set of rows, the two
 * tabs cannot put the same class in both.
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
    /**
     * Every early return sends this shape.
     *
     * It used to be spelled out twice, and the no-classroom copy was missing
     * `missed`. The page destructures that key and spreads it, so `[...undefined]`
     * threw and a student with no active enrolment met a crash instead of the
     * empty state. One builder, so a key can never again exist on one path and
     * not the other.
     */
    const emptyPayload = (rewatchable: unknown[] = [], rewatchableTruncated = false) => ({
      journey: null,
      pace: null,
      items: [],
      missed: [],
      excluded: [],
      totals: null,
      missedTotals: { total: 0, completed: 0, open: 0, overdue: 0 },
      clock: null,
      windows: null,
      rewatchable,
      rewatchableTruncated,
    });

    if (!classroomId) return NextResponse.json(emptyPayload());

    // Ahead of the backlog guard below on purpose. `getCatchupBacklog` returns
    // null for a student with no absence rows at all, and that is exactly the
    // student who attended everything and has nothing BUT things to rewatch.
    // Computed after that guard, the tab would be empty for the only people who
    // see nothing else on the screen.
    const { rewatchable, truncated } = await listRewatchableRecaps(supabase, user.id, classroomId);

    // Self-heal, same reasoning as the per-class route: a student enrolled a
    // minute ago should not be told to come back after the weekly sweep.
    let backlog = await getCatchupBacklog(user.id, classroomId, supabase);
    if (!backlog) {
      await ensureCatchupJourney(user.id, classroomId, {}, supabase);
      backlog = await getCatchupBacklog(user.id, classroomId, supabase);
    }
    if (!backlog) return NextResponse.json(emptyPayload(rewatchable, truncated));

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
      // The other tab. Nothing here is owed, which is why it carries no status,
      // no clock and no position: those all belong to the lists above.
      rewatchable,
      rewatchableTruncated: truncated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your catch-up list';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
