import { NextRequest, NextResponse } from 'next/server';
import { assertCapability, getRequestUser } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent } from '@/lib/sketchbook-access';
import { overallLevel } from '@/lib/student-level';
import { loadStudentLevelDetail } from '@/lib/student-level-store';
import { loadStudentRecentDrawings } from '@/lib/recent-drawings';
import type { StudentSnapshotPayload } from '@/lib/student-level-types';

const HISTORY = 5;
const DRAWINGS = 4;

/**
 * GET /api/students/[id]/snapshot   (staff who teach this student)
 *
 * What opens when a teacher taps a student's face: their level per skill, who
 * set it and when, the last few changes, and their latest drawings. Read on tap
 * only, never in a list, so it costs one request per look.
 *
 * Staff only. The level is a teacher's judgement and is never shown to the
 * student or a parent.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'coord.student.view');
    await assertStaffSeesStudent(caller, params.id);

    const [detail, recentDrawings] = await Promise.all([
      loadStudentLevelDetail(params.id, HISTORY),
      loadStudentRecentDrawings(params.id, DRAWINGS),
    ]);

    const body: StudentSnapshotPayload = {
      studentId: params.id,
      levels: detail.levels,
      overallLevel: overallLevel({ drawing: detail.levels.drawing?.level ?? null }),
      history: detail.history,
      recentDrawings,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load the student snapshot');
  }
}
