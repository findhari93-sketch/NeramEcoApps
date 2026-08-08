import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';
import { loadAllClearStudents } from '@/lib/catchup-cohort';

export const dynamic = 'force-dynamic';

/**
 * GET /api/catchup/wall?classroomId=
 *
 * The classmates who have nothing left to catch up on, for the student
 * dashboard.
 *
 * This is the only endpoint in Nexus that shows one student something about
 * another, so three rules are enforced here rather than left to the component:
 *
 *  1. It answers only for a classroom the caller is actually enrolled in. A
 *     student cannot read another cohort's wall by editing the query string.
 *  2. It carries names and faces and nothing else. No counts, no progress, no
 *     hint of who is behind, because there is no version of this list that is
 *     safe to show if it also implies a complement.
 *  3. `student.catchup-wall` gates it server side, so switching the feature off
 *     stops the data at the door rather than hiding a card that still shipped
 *     its payload to the browser.
 *
 * Dormant students are excluded by loadAllClearStudents, which matters more here
 * than on the teacher screen: dormancy is a staff judgement, and a classmate
 * noticing somebody has quietly left the wall is not how a family should find
 * out about it.
 */

/**
 * The wall is identical for everyone in a classroom, so it is computed once per
 * classroom rather than once per dashboard.
 *
 * Deriving it honestly costs a roster read, an absence read and the six-query
 * class-facts batch, and this route is hit by every student every time they open
 * the app. Without this, a thirty-student cohort opening at 6pm pays that thirty
 * times over for one identical answer.
 *
 * Module scope, so it is per lambda instance and a cold start simply recomputes.
 * That is the right trade for a list whose worst failure is being five minutes
 * stale: a student who clears their last class waits at most one window to see
 * their own name, and nobody is ever shown as clear who is not.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: Array<{ id: string; name: string | null; avatar_url: string | null }> }>();

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroomId');
    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroomId' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: setting } = await supabase
      .from('nexus_settings')
      .select('value')
      .eq('key', FEATURE_FLAGS_KEY)
      .maybeSingle();
    const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
    if (!isFeatureEnabled('student.catchup-wall', flags)) {
      // Not a 403: the feature being off is not a permission problem, and the
      // dashboard should quietly render nothing rather than an error.
      return NextResponse.json({ allClear: [] });
    }

    // Staff can look at any classroom, the same as every other teacher surface.
    // A student has to be in it.
    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      const { data: enrolment } = await supabase
        .from('nexus_enrollments')
        .select('id')
        .eq('classroom_id', classroomId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (!enrolment) {
        return NextResponse.json({ error: 'Not in this classroom' }, { status: 403 });
      }
    }

    const hit = cache.get(classroomId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return NextResponse.json({ allClear: hit.value });
    }

    const students = await loadAllClearStudents(supabase, classroomId);
    // Names and faces only. The standing block that comes back from the loader
    // carries counts and nudge history, and none of it leaves this function.
    const value = students.map((s) => ({
      id: s.id,
      name: s.name,
      avatar_url: s.avatar_url,
    }));

    cache.set(classroomId, { at: Date.now(), value });
    return NextResponse.json({ allClear: value });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the wall';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
