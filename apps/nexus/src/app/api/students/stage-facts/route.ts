import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, loadClassroomRoster } from '@neram/database';
import { foldStudentFacts } from '@/lib/stage-facts';

/**
 * GET /api/students/stage-facts   (staff)
 *
 * Who each student IS, keyed by user id, in one small payload: their cohort,
 * whether they have paused, their name and their face.
 *
 * WHY A LOOKUP TABLE RATHER THAN A FIELD ON EACH PAYLOAD. The stage ring is
 * meant to appear wherever a student's face does, and that is roughly thirty
 * screens fed by about twenty different routes: a drawing review, a leaderboard
 * row, a comment thread, an evaluation queue. Adding two columns to twenty
 * payloads is twenty chances for one of them to be forgotten, which is exactly
 * how the classification ended up visible on four screens and nowhere else.
 * Fetched once per session instead, so adopting the badge on a new screen is a
 * one-line component swap with no server change at all.
 *
 * The photo rides along for the same reason, and it is why a screen that knows
 * nothing but a user id can still show the real person. The roster already loads
 * avatar_url and name to answer this query, so carrying them costs one join
 * column and no extra request. Over the wire it is about 1.4x the old payload,
 * not 3x: every storage URL shares a long prefix that gzip collapses.
 *
 * STAFF ONLY, and that line is deliberate. Dormancy is a staff judgement about a
 * student's engagement, and a leaderboard that quietly told every classmate who
 * had paused would be a real harm. The provider is mounted in the teacher layout
 * alone; on a student screen the map is empty and every avatar renders plain.
 */

export const dynamic = 'force-dynamic';

/**
 * The wire shape. Named for the classification it started as; it now carries
 * identity too, but the name is load-bearing across the provider, the hook and
 * three test files, and renaming it buys nothing.
 */
export type { StudentFact as StageFact } from '@/lib/stage-facts';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: staff } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();

    if (!staff) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (staff.user_type !== 'teacher' && staff.user_type !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // null classroom means every classroom, which the roster helper supports and
    // which is what this needs: an avatar on the drawing-review queue has no
    // classroom context to scope by. Dormant students are loaded rather than
    // filtered, because "paused" is one of the three states the ring reports.
    const { members } = await loadClassroomRoster(null, {
      includeDormant: true,
      client: supabase,
    });

    // One fact per student, not per enrolment. See lib/stage-facts.ts for why
    // the four fields fold three different ways.
    const facts = foldStudentFacts(members);

    return NextResponse.json({ facts, count: Object.keys(facts).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load student classifications';
    // 401 rather than 500 when the caller simply is not signed in: the badge is
    // decoration, and a signed-out tab must not fill the log with server errors.
    const unauthenticated = /Authorization|token/i.test(message);
    return NextResponse.json({ error: message }, { status: unauthenticated ? 401 : 500 });
  }
}
