import { NextRequest, NextResponse } from 'next/server';
import { listUnflipped } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { staffStudentIds } from '@/lib/sketchbook-access';
import { heldSubmissionIds } from '@/lib/drawing-hold';
import { getSupabaseAdminClient } from '@neram/database';

/** How recently a reason has to have arrived to still count as news. */
const CATCHUP_BADGE_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * GET /api/nav-badges
 * Returns lightweight badge counts for sidebar navigation items.
 * Students: count of their own open+in_progress issues.
 * Teachers/Admins: count of all open+in_progress issues.
 */
export async function GET(request: NextRequest) {
  try {
    // getRequestUser rather than verifyMsToken + a hand-rolled users select, because it
    // holds the resolved row for 30 seconds. This route is polled every 60 seconds by
    // every signed-in user for as long as Nexus is open, so the lookup it skips is a cost
    // paid forever rather than once. It refuses parent tokens exactly as verifyMsToken's
    // default did here.
    let user: Awaited<ReturnType<typeof getRequestUser>>;
    try {
      user = await getRequestUser(request.headers.get('Authorization'));
    } catch (err) {
      // It throws where this route answered with a status. Keep both apart: a caller with
      // no users row is a 404, a bad token is a 401, and the poller tells them apart.
      const message = err instanceof Error ? err.message : 'Unauthorized';
      return NextResponse.json(
        { error: message },
        { status: message === 'User not found' ? 404 : 401 },
      );
    }

    const supabase = getSupabaseAdminClient();

    const badges: Record<string, number> = {};

    if (user.user_type === 'teacher' || user.user_type === 'admin') {
      // Five independent counts, so they go together rather than one after another.
      // This route is polled every 60 seconds by every signed-in staff member for as
      // long as Nexus is open, so its cost is paid forever, not once.
      const since = new Date(Date.now() - CATCHUP_BADGE_WINDOW_MS).toISOString();

      const [issues, drawings, photoCount, freshReasons, sketchInbox] = await Promise.all([
        // Count all open + in_progress issues
        supabase
          .from('nexus_foundation_issues')
          .select('id', { count: 'exact', head: true })
          .in('status', ['open', 'in_progress']),

        // Drawings waiting on THIS teacher, in the classrooms they teach, minus
        // anything they have already finished and are only holding.
        //
        // This used to count every submitted drawing in the tenant, across every
        // source and every classroom: a number no single teacher could drive to
        // zero, which the two badges beside it had already been fixed to avoid.
        // Held reviews come off too. A held review keeps status 'submitted' so
        // the student sees nothing, and counting it would leave work the teacher
        // has finished looking like work they have not started.
        //
        // Sketchbook uploads insert as 'completed' and never reach this queue;
        // the exclusion stays as belt-and-braces.
        (async () => {
          try {
            const caller = await getRequestUser(request.headers.get('Authorization'));
            const students = await staffStudentIds(caller, null);
            if (students.length === 0) return 0;
            const { data: pending } = await supabase
              .from('drawing_submissions')
              .select('id')
              .eq('status', 'submitted')
              .neq('source_type', 'sketchbook')
              .in('student_id', students);
            const ids = ((pending ?? []) as Array<{ id: string }>).map((r) => r.id);
            if (ids.length === 0) return 0;
            const held = await heldSubmissionIds(supabase, ids);
            return ids.length - held.size;
          } catch {
            return 0;
          }
        })(),

        // Profile photos waiting for a human decision, in the classrooms THIS
        // person can open.
        //
        // The viewer argument is the whole point. The queue at
        // /teacher/photo-review loads one classroom, picked from a dropdown that
        // only offers the signed-in person's own classrooms (/api/auth/me ->
        // classrooms). A tenant-wide count over that is a badge the person
        // looking at it cannot clear: on staging it read 1 for a teacher whose
        // own roster was empty, because the pending student sat in a classroom
        // he is not enrolled in. The RPC now takes p_user_id and restricts to
        // the same set auth/me hands the dropdown, so the number is always one
        // this person can drive to zero.
        //
        // Counting distinct students, so a two-classroom student is one piece
        // of work. Under impersonation verifyMsToken resolves `oid` to the
        // target, so an admin viewing as a teacher gets that teacher's badge,
        // matching the queue in front of them.
        supabase.rpc('count_pending_photo_reviews', { p_user_id: user.id }),

        // Catch-up: freshly explained absences, plus anything still open from a
        // class that has already been taught again.
        //
        // Deliberately a ROLLING WINDOW, not an unread inbox. There is no per-staff
        // seen_at column and there should not be one: this badge answers "is there
        // something new to look at", and a reason from three days ago is no longer
        // news whether or not anyone opened the page. Anyone tempted to make it
        // dismissible should add a real notification instead, which the daily
        // digest already is.
        //
        // Cast because nexus_class_absences is absent from database.generated.ts,
        // the same reason catchup-journey.ts carries @ts-nocheck. Regenerating the
        // types is the real fix and is out of scope here.
        (supabase as any)
          .from('nexus_class_absences')
          .select('id', { count: 'exact', head: true })
          .is('caught_up_at', null)
          .gte('reason_submitted_at', since),

        // Sketches this teacher has not flipped through, in the classrooms
        // they teach. Scoped to the viewer for the same reason the photo count
        // is: a number the person cannot drive to zero is not a badge.
        (async () => {
          try {
            const caller = await getRequestUser(request.headers.get('Authorization'));
            const students = await staffStudentIds(caller, null);
            const { rows, remaining } = await listUnflipped(caller.id, students, 50);
            return rows.length + remaining;
          } catch {
            return 0;
          }
        })(),
      ]);

      badges.issues = issues.count ?? 0;
      badges.drawing_reviews = typeof drawings === 'number' ? drawings : 0;
      badges.photo_review = typeof photoCount.data === 'number' ? photoCount.data : 0;
      badges.catchup = freshReasons.count ?? 0;
      badges.sketchbook_inbox = sketchInbox;
    } else {
      const [issues, catchup] = await Promise.all([
        // Student: count their own open + in_progress issues
        supabase
          .from('nexus_foundation_issues')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', user.id)
          .in('status', ['open', 'in_progress']),

        // Classes this student still owes. Not a rolling window like the staff
        // count above: this is a debt, and it does not stop being one because it
        // is a fortnight old.
        //
        // The predicate has to be the same one getCatchupBacklog treats as open
        // (not caught up, not excused), or the number on the tab disagrees with
        // the list behind it, which is worse than no number.
        //
        // Cast because nexus_class_absences is absent from database.generated.ts,
        // the same reason catchup-journey.ts carries @ts-nocheck.
        (supabase as any)
          .from('nexus_class_absences')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', user.id)
          .is('caught_up_at', null)
          .is('excused_at', null),
      ]);

      badges.issues = issues.count ?? 0;
      badges.catchup = catchup.count ?? 0;
    }

    // no-store, and deliberately so after this header caused a bug.
    //
    // It used to be `private, max-age=30`, which never saved a single poll:
    // NavBadgeProvider polls every 60 seconds and 60 > 30, so every scheduled
    // request revalidated anyway. The only requests it did eliminate were the
    // two that must never be eliminated, the explicit refreshBadges() fired the
    // instant a teacher approves a photo, and the catch-up fetch when a hidden
    // tab comes back inside 30 seconds. So it bought nothing and paid for it
    // with a badge that re-set itself to the stale number the moment it was
    // cleared. `private` was never strong enough either: what served the stale
    // body was the browser's own cache, which honours private perfectly well.
    return NextResponse.json({ badges }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load badges';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
