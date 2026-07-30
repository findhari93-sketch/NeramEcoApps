import { NextRequest, NextResponse } from 'next/server';
import { getParentUser, resolveChildContext } from '@/lib/parent-auth';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { loadEnrollmentContext } from '@/lib/parent-enrollment';
import { loadParentClassDetail } from '@/lib/parent-classes';
import { loadParentWork } from '@/lib/parent-work';
import { loadParentTests } from '@/lib/parent-tests';
import type {
  ParentAssignmentDetail,
  ParentCatchupStatus,
  ParentClassDetailResponse,
  ParentTestDetail,
} from '@/lib/parent-view-types';

/**
 * GET /api/parent/classes/[classId]?student=
 *
 * One class in full: what was covered, whether the child was there and for how
 * long, the work set and whether they did it, the test and what they scored,
 * and where they stand on catching up.
 *
 * TWO GATES, NOT ONE. resolveChildContext proves which child the caller may ask
 * about; it says nothing about whether this class belongs to that child's
 * classroom. loadParentClassDetail applies the second gate (classroom, publish
 * state, batch) and returns null for every failure, which becomes one indistinct
 * 404 here so a parent cannot probe for class ids in other classrooms. The same
 * deliberate ambiguity as assertParentOf in lib/parent-auth.ts.
 *
 * STATUS ONLY. No recording url, no resource rows, no Teams link, anywhere in
 * this response. Enforced in lib/parent-classes.ts and tested there.
 *
 * Fired on tap, two or three times per session, which is why the expensive
 * parts (bullets, images, tags, aggregates, test marks) live here rather than
 * being loaded for thirty classes at once by the calendar.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { classId: string } }
) {
  try {
    const parent = await getParentUser(request.headers.get('Authorization'));
    const { child, classroomId } = await resolveChildContext(
      parent.id,
      request.nextUrl.searchParams.get('student')
    );

    const { enrollment, notice } = await loadEnrollmentContext(
      child.id,
      classroomId,
      child.name
    );
    const scope = { batchId: enrollment?.batch_id ?? null };

    const detail = await loadParentClassDetail(
      child.id,
      classroomId,
      scope,
      params.classId
    );

    // One message for "does not exist", "not published", "another batch" and
    // "another classroom". Distinguishing them would turn this into an oracle.
    if (!detail) throw new ApiError('That class could not be found.', 404);

    const [work, tests] = await Promise.all([
      // Narrowed to the work set on this class, but through the same loader the
      // Work tab uses, so the two surfaces can never disagree about a bucket.
      loadParentWork(child.id, classroomId, detail.assignmentIds),
      loadParentTests(child.id, [params.classId]),
    ]);
    const assignments = work.items;

    const body: ParentClassDetailResponse = {
      child: {
        id: child.id,
        name: child.name,
        avatar_url: child.avatar_url,
        classroom_id: classroomId,
        classroom_name: child.classroom_name,
      },
      notice,
      cls: detail.cls,
      whatHappened: detail.whatHappened,
      assignments,
      tests,
      catchup: buildCatchup(detail.absence, detail.cls, assignments),
    };

    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err, 'Could not load the class');
  }
}

/**
 * Where the child stands on a class they missed or joined after.
 *
 * Null when there is no absence row, which is the common case and means there
 * was nothing to catch up on. Completion is DERIVED (watched, nothing
 * outstanding, test passed) rather than read from caught_up_at alone, because
 * that column is only ever written when the student presses the button: a child
 * who has finished everything but not pressed it should not read as behind.
 */
function buildCatchup(
  absence: { kind?: string | null; reason_note?: string | null; caught_up_at?: string | null } | null,
  cls: ParentClassDetailResponse['cls'],
  assignments: ParentAssignmentDetail[]
): ParentCatchupStatus | null {
  if (!absence) return null;

  const outstanding = assignments.filter((a) => a.bucket === 'needs_doing').length;

  return {
    required: true,
    kind: (absence.kind as ParentCatchupStatus['kind']) ?? null,
    reasonNote: absence.reason_note ?? null,
    recordingWatched: cls.recording.watchedByChild === true,
    assignmentsOutstanding: outstanding,
    assignmentsTotal: assignments.length,
    testRequired: !!cls.testBadge,
    testPassed: cls.testBadge?.passed === true,
    caughtUpAt: absence.caught_up_at ?? null,
  };
}
