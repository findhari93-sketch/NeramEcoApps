import { NextRequest, NextResponse } from 'next/server';
import { getUser360 } from '@neram/database';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { authoriseStudentLifecycleRead } from '@/lib/student-lifecycle-server';
import type { StudentLifecyclePayload } from '@/lib/lifecycle-display';

/**
 * GET /api/students/[id]/lifecycle?classroom={id}
 *
 * The lifecycle facts the profile header shows: stage, engagement, last
 * meaningful activity and its source, target exams and year, what is missing
 * from the profile, and how many open duplicate-record candidates name this
 * student. A trimmed subset of getUser360: payments, CRM, feedback and merge
 * history stay in Admin and never reach this payload.
 *
 * Same gate as the core profile route (coord.student.view plus a student
 * enrolled in `classroom`). Read-only signals: nothing here decides access.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: studentId } = await params;
    await authoriseStudentLifecycleRead(request, studentId);

    const u360 = await getUser360(studentId);
    if (!u360) throw new ApiError('Student not found', 404);

    const p = u360.person ?? {};
    const payload: StudentLifecyclePayload = {
      lifecycle_stage: p.lifecycle_stage ?? null,
      engagement: p.engagement ?? null,
      last_meaningful_activity_at: p.last_meaningful_activity_at ?? null,
      last_meaningful_activity_source: p.last_meaningful_activity_source ?? null,
      target_exams: Array.isArray(p.target_exams) ? p.target_exams : [],
      target_year: p.target_year ?? null,
      profile_missing: Array.isArray(p.profile_missing) ? p.profile_missing : [],
      openDuplicates: Number(u360.openDuplicates) || 0,
    };

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return errorResponse(err, 'Failed to load lifecycle facts');
  }
}
