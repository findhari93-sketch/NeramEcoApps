import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, loadClassroomRoster } from '@neram/database';

/**
 * GET /api/students/stage-facts   (staff)
 *
 * Every student's classification, keyed by user id, in one small payload.
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
 * It is small enough to justify that: two short strings per active student, so a
 * hundred-student org is a few kilobytes, and the client holds it in the SWR
 * cache for the session.
 *
 * STAFF ONLY, and that line is deliberate. Dormancy is a staff judgement about a
 * student's engagement, and a leaderboard that quietly told every classmate who
 * had paused would be a real harm. The provider is mounted in the teacher layout
 * alone; on a student screen the map is empty and every avatar renders plain.
 */

export const dynamic = 'force-dynamic';

export interface StageFact {
  /** nexus_enrollments.current_standard. Null means nobody has recorded one. */
  stage: string | null;
  dormant: boolean;
}

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

    /**
     * One fact per student, not per enrolment.
     *
     * Classroom-per-year means a returning student legitimately holds an
     * enrolment in both the 2026 and the 2027 classroom. The newest enrolment
     * wins for the stage, since a student who was in Class 11 last year is in
     * Class 12 now and the older row is simply out of date.
     *
     * Dormancy is the opposite: a student counts as paused only when EVERY
     * active enrolment says so, matching pickTrackedIds. Someone dormant in last
     * year's archived classroom and active in this year's is not on a break.
     */
    const newest = new Map<string, string>();
    const facts: Record<string, StageFact> = {};

    for (const member of members) {
      const existing = facts[member.user_id];
      const at = member.enrolled_at || '';

      if (!existing) {
        facts[member.user_id] = {
          stage: member.current_standard ?? null,
          dormant: member.participation_status === 'dormant',
        };
        newest.set(member.user_id, at);
        continue;
      }

      // Any participating enrolment clears the dormant flag for this person.
      if (member.participation_status !== 'dormant') existing.dormant = false;

      if (at > (newest.get(member.user_id) || '')) {
        newest.set(member.user_id, at);
        existing.stage = member.current_standard ?? null;
      }
    }

    return NextResponse.json({ facts, count: Object.keys(facts).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load student classifications';
    // 401 rather than 500 when the caller simply is not signed in: the badge is
    // decoration, and a signed-out tab must not fill the log with server errors.
    const unauthenticated = /Authorization|token/i.test(message);
    return NextResponse.json({ error: message }, { status: unauthenticated ? 401 : 500 });
  }
}
