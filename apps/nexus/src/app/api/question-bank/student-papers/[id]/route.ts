/**
 * GET /api/question-bank/student-papers/[id]?classroom_id=<id>
 *
 * One paper, with everything its detail screen draws: the three face states, the
 * linked PDF as a view-safe DTO, and the placed mock with this student's attempt
 * history against it. One call, because the screen is one screen.
 *
 * The PDF is re-checked against this student's own folder audience inside
 * getPaperDetailForStudent rather than trusted from the link. A paper published
 * to everyone must not become a way into a folder targeted at one exam.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, messageOf } from '@/lib/api-errors';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getPaperDetailForStudent } from '@neram/database';
import { getRequestUser, getStudentExamSet, isStaff } from '@/lib/study-materials';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('Authorization');
    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    const access = await verifyQBAccess(authHeader, classroomId);
    if (!access.ok) return access.response;

    // The full header, not the token: getRequestUser resolves impersonation and
    // parent-portal sessions from it, and a student being viewed-as must see
    // their own papers rather than the teacher's.
    const user = await getRequestUser(authHeader);
    const staff = isStaff(user);

    const detail = await getPaperDetailForStudent({
      paperId: params.id,
      studentId: access.caller.id,
      // Staff previewing the student view are not filtered by exam audience;
      // an empty set means "no restriction" to isFolderVisibleToStudent.
      studentExams: staff ? [] : await getStudentExamSet(user.id),
      studentProgram: user.student_program,
    });

    if (!detail) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }
    return NextResponse.json({ data: detail });
  } catch (err) {
    const detail = messageOf(err);
    console.error('[QB Student Paper] GET:', detail, err);
    return errorResponse(err, 'Something went wrong.');
  }
}
