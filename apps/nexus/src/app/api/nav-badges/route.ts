import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
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
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const badges: Record<string, number> = {};

    if (user.user_type === 'teacher' || user.user_type === 'admin') {
      // Count all open + in_progress issues
      const { count } = await supabase
        .from('nexus_foundation_issues')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']);

      badges.issues = count ?? 0;

      // Count pending drawing reviews (submitted, not yet reviewed)
      const { count: drawingCount } = await supabase
        .from('drawing_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted');

      badges.drawing_reviews = drawingCount ?? 0;

      // Profile photos waiting for a human decision.
      //
      // This MUST match the population /teacher/photo-review shows, which is a
      // classroom roster. Counting users.photo_status alone sweeps in ~1,350
      // marketing leads whose avatar came from Google sign-in and who never open
      // Nexus, which is how the badge came to read "99+" over an empty queue.
      // The RPC does the enrollment join once, server side, counting distinct
      // students so a two-classroom student is one piece of work.
      const { data: photoCount } = await supabase.rpc('count_pending_photo_reviews');

      badges.photo_review = typeof photoCount === 'number' ? photoCount : 0;

      // Catch-up: freshly explained absences, plus anything still open from a
      // class that has already been taught again.
      //
      // Deliberately a ROLLING WINDOW, not an unread inbox. There is no per-staff
      // seen_at column and there should not be one: this badge answers "is there
      // something new to look at", and a reason from three days ago is no longer
      // news whether or not anyone opened the page. Anyone tempted to make it
      // dismissible should add a real notification instead, which the daily
      // digest already is.
      const since = new Date(Date.now() - CATCHUP_BADGE_WINDOW_MS).toISOString();
      // Cast because nexus_class_absences is absent from database.generated.ts,
      // the same reason catchup-journey.ts carries @ts-nocheck. Regenerating the
      // types is the real fix and is out of scope here.
      const { count: freshReasons } = await (supabase as any)
        .from('nexus_class_absences')
        .select('id', { count: 'exact', head: true })
        .is('caught_up_at', null)
        .gte('reason_submitted_at', since);

      badges.catchup = freshReasons ?? 0;
    } else {
      // Student: count their own open + in_progress issues
      const { count } = await supabase
        .from('nexus_foundation_issues')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .in('status', ['open', 'in_progress']);

      badges.issues = count ?? 0;
    }

    return NextResponse.json({ badges });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load badges';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
