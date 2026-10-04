import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { getSupabaseAdminClient } from '@neram/database';
import { buildStudentTestsOverview } from '@/lib/student-tests-overview';

export const dynamic = 'force-dynamic';
// GET-only: Next 14 would otherwise write this route's server fetches to the Data Cache (billed as ISR writes).
export const fetchCache = 'force-no-store';

/**
 * GET /api/student/tests/overview?classroom=<id>
 *
 * Everything the student tests page shows, in one call, in the order a student
 * actually needs it:
 *
 *   due      assigned tests with an open window, soonest deadline first
 *   all      every test the class has, open or not, for the consolidated list
 *   practice the teacher's practice pool, grouped by the folder it was filed in
 *   mine     the student's own papers, in their own folders
 *   recent   the last few results
 *
 * A student should never be handed 1121 loose questions and told to get on with
 * it. This is the shape that replaces that.
 *
 * `due` and `all` overlap on purpose. `due` is the "what do I do now" list at the
 * top of the page and only holds tests still open. `all` is the consolidated
 * record of everything the teacher has set, including tests that have closed,
 * because "did I miss one" is a question a student needs answered and dropping
 * closed placements silently meant they could never see one had existed.
 *
 * Gated kinds (class prep, catch-up) are deliberately absent: they are opened
 * from the class they belong to, which is where their unlock rules are enforced.
 * Class tests ARE here, because nothing gates them: they are ordinary papers with
 * a deadline, and a student needs one list of what they owe.
 */

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    let classroomId = params.get('classroom');
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    const isStaff = resolveStaffRole(access.caller) !== null;

    /**
     * ?as_student=<user id>: build this page for somebody else.
     *
     * Staff only, and the whole reason it exists is a support ticket. A student
     * reports that a test says Closed when they were told it would open, and
     * the only ways to check used to be watching the recording as them or
     * impersonating them for an hour. This answers the same question in one
     * request, because it IS the same code path: the verdict a teacher reads
     * here is the sentence on the student's own card, not a second derivation
     * of it that can disagree.
     *
     * It sits on this route rather than in a staff route of its own precisely
     * so there is only one derivation. The authority is the same
     * resolveStaffRole that already decides is_staff_preview below.
     */
    const asStudent = params.get('as_student');
    let studentId = access.caller.id;
    if (asStudent && asStudent !== access.caller.id) {
      if (!isStaff) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
      studentId = asStudent;
      if (!classroomId) {
        // Their newest active cohort. A student on no active classroom gets an
        // honest empty page rather than a 500, the same way a signed-in student
        // with no classroom already does.
        const { data: enrolment } = await (getSupabaseAdminClient() as any)
          .from('nexus_enrollments')
          .select('classroom_id, enrolled_at')
          .eq('user_id', studentId)
          .eq('role', 'student')
          .eq('is_active', true)
          .order('enrolled_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        classroomId = enrolment?.classroom_id || null;
      }
    }
    const data = await buildStudentTestsOverview(getSupabaseAdminClient() as any, { studentId, classroomId, isStaff });
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your tests';
    console.error('Student tests overview error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
