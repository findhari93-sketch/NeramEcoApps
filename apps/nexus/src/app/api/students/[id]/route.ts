import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, assertCapability, hasCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { loadStudentProfileCore, StudentNotInClassroomError } from '@/lib/student-profile';

/**
 * GET /api/students/[id]?classroom={id}&full=1
 *
 * The core student-profile bundle: identity, enrolment, application form,
 * guardians, parent-portal access, documents, checklist, topics and a merged
 * activity timeline. This is the only blocking fetch the profile page makes.
 *
 * NOT HERE, on purpose:
 *
 *   Money        lives in ./finance, behind coord.student.finance. The
 *                commercial columns are never named in a query this route can
 *                reach, so a teacher's request does not ask Postgres for them
 *                and there is nothing to find in the response.
 *
 *   Attendance,  live in ./performance. They are the expensive reads, and a
 *   assignments, slow attendance query must not stop a teacher seeing a phone
 *   tests,       number. This route used to compute an attendance percentage
 *   catch-up     from nexus_attendance filtered on student_id ALONE, then
 *                divide by ONE classroom's completed-class count: a student in
 *                two classrooms scored above 100%, and a classroom whose
 *                attendance was never synced scored 0% rather than admitting it
 *                was not measured. Both are fixed in ./performance by reusing
 *                loadChildAttendance, which scopes to the classroom and
 *                intersects against the roster-wide measured set.
 *
 * `full=1` returns completed checklist items too. The default ships only the
 * open ones plus counts, because the full list is tens of kilobytes a phone
 * never renders.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'coord.student.view');

    const { id: studentId } = await params;
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const core = await loadStudentProfileCore(studentId, classroomId, {
      includeAllChecklist: request.nextUrl.searchParams.get('full') === '1',
    });

    // Tells the client whether to attempt the finance fetch. It is a hint that
    // saves a guaranteed 403, not the gate: the gate is the assert in ./finance.
    core.capabilities = { finance: hasCapability(caller, 'coord.student.finance') };

    return NextResponse.json(core);
  } catch (err) {
    if (err instanceof StudentNotInClassroomError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    // errorResponse maps an authorization failure to 403 and an auth failure to
    // 401. This route previously answered 401 for EVERY error, which turned the
    // capability denial into "your session expired" and hid real 500s.
    console.error('Student detail error:', err);
    return errorResponse(err, 'Failed to load student details');
  }
}
