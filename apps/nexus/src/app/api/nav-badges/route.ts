import { NextRequest, NextResponse } from 'next/server';
import { listUnflipped } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { staffStudentIds } from '@/lib/sketchbook-access';
import { countOwedDrawings } from '@/lib/owed-drawings';
import { getSupabaseAdminClient } from '@neram/database';
import { httpStatusForError } from '@/lib/api-errors';

/** How recently a reason has to have arrived to still count as news. */
const CATCHUP_BADGE_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * One number from the two the issue RPC returns.
 *
 * A ticket can be both in play and unread, so the two overlap and the sum can
 * exceed the ticket count. That is deliberate: the badge answers "how much is
 * there to do", and a reply sitting unread on an open ticket is a second thing
 * to do, not the same one counted twice.
 *
 * Returns 0 rather than throwing when the RPC is missing, so a Nexus deployed
 * ahead of its migration loses a badge instead of the whole sidebar.
 */
function issueBadgeTotal(data: unknown): number {
  // Accepts the array a set-returning RPC gives back, and the bare object
  // PostgREST answers with when a function is registered as returning one row.
  // Getting this wrong shows as a badge stuck at zero rather than as an error,
  // which is the kind of bug nobody reports.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { inbox?: number | null; unread?: number | null }
    | null
    | undefined;
  if (!row || typeof row !== 'object') return 0;
  return (row.inbox ?? 0) + (row.unread ?? 0);
}

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
      // It throws where this route answered with a status. Keep them apart: a caller
      // with no users row is a 404, a bad token is a 401, and anything else (Graph
      // timing out, the users lookup failing) is the server's trouble, a 500, never a
      // 401 that reads to the client as a session that has ended.
      const message = err instanceof Error ? err.message : 'Unauthorized';
      return NextResponse.json(
        { error: message },
        { status: message === 'User not found' ? 404 : httpStatusForError(err) },
      );
    }

    const supabase = getSupabaseAdminClient();

    const badges: Record<string, number> = {};

    if (user.user_type === 'teacher' || user.user_type === 'admin') {
      // Five independent counts, so they go together rather than one after another.
      // This route is polled every 60 seconds by every signed-in staff member for as
      // long as Nexus is open, so its cost is paid forever, not once.
      const since = new Date(Date.now() - CATCHUP_BADGE_WINDOW_MS).toISOString();

      // The staff roster feeds two badges. Computed once per poll, from the caller
      // already resolved above: it used to be re-resolved and recomputed in each
      // branch, an enrolment query per classroom twice over, every 60s per staff
      // member. Each branch still catches on its own, so a roster failure zeroes
      // only those two badges. The no-op catch keeps a rejection from being
      // reported as unhandled before the branches await it.
      const roster = staffStudentIds(user, null);
      roster.catch(() => {});

      const [issues, owed, photoCount, freshReasons, sketchInbox] = await Promise.all([
        // Tickets in play, plus tickets carrying a reply nobody on the team has
        // read yet. One RPC rather than two head counts because PostgREST
        // cannot compare two columns, so `staff_seen_at < last_reply_at` has no
        // .filter() form. Same shape as count_pending_photo_reviews below.
        //
        // The seen stamp is shared across staff on purpose: this is a shared
        // inbox, so one person reading a reply clears the dot for everyone.
        // Making it per person means a reads table and a join on every poll,
        // which is the cost this route's header comment exists to avoid.
        supabase.rpc('nexus_issue_badge_counts', { p_user_id: user.id, p_is_staff: true }),

        // Owed drawing work in the classrooms this teacher teaches: assignment
        // drawings (Assignments badge) and test drawings (Exams badge). Practice
        // never counts; see lib/owed-drawings.
        (async () => {
          try {
            return await countOwedDrawings(supabase, await roster);
          } catch {
            return { assignment: 0, test: 0 };
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
            const { rows, remaining } = await listUnflipped(user.id, await roster, 50);
            return rows.length + remaining;
          } catch {
            return 0;
          }
        })(),
      ]);

      badges.issues = issueBadgeTotal(issues.data);
      badges.assignment_drawings = owed.assignment;
      badges.test_drawings = owed.test;
      badges.photo_review = typeof photoCount.data === 'number' ? photoCount.data : 0;
      badges.catchup = freshReasons.count ?? 0;
      badges.sketchbook_inbox = sketchInbox;
    } else {
      const [issues, catchup] = await Promise.all([
        // The student's own tickets in play, plus any carrying a staff reply
        // they have not opened.
        //
        // `inbox` now includes awaiting_confirmation, which the old head count
        // left out. That is the one state actually waiting on the student, so a
        // ticket asking them to confirm a fix used to produce no badge at all:
        // the number went quiet at exactly the moment it had something to say.
        supabase.rpc('nexus_issue_badge_counts', { p_user_id: user.id, p_is_staff: false }),

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

      badges.issues = issueBadgeTotal(issues.data);
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
    // Past authentication, so a failure here is a badge query failing: a 500.
    const message = err instanceof Error ? err.message : 'Failed to load badges';
    console.error('[nav-badges] failed:', message);
    return NextResponse.json({ error: message }, { status: httpStatusForError(err) });
  }
}
