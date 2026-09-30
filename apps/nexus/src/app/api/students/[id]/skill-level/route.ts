import { NextRequest, NextResponse } from 'next/server';
import { assertCapability, getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { parseLevelWrite } from '@/lib/student-level';
import { assertIsEnrolledStudent, writeSkillLevel } from '@/lib/student-level-store';
import type { SkillLevelWriteResult } from '@/lib/student-level-types';

/**
 * PUT /api/students/[id]/skill-level   (managers and admins)
 *
 * Body: { skill: 'drawing', level: 'top' | 'mid' | 'needs_practice' | null,
 *         note?: string, source: 'sort' | 'flip' | 'snapshot' | 'profile' }
 *
 * Sets a student's level for one skill, or clears it with null. Returns the
 * previous level so the screen's Undo can send it straight back. Every change is
 * logged with who made it and from which screen.
 *
 * `coord.student.level` is manager-only (founder, 30 Sep 2026): the level decides
 * how much teacher time a student gets. Teachers read it on the avatar and in
 * the snapshot, and cannot change it.
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'coord.student.level');

    const parsed = parseLevelWrite(await request.json().catch(() => null));
    if (!parsed.ok) throw new ApiError(parsed.error, 400);

    await assertIsEnrolledStudent(params.id);
    const result = await writeSkillLevel({
      studentId: params.id,
      ...parsed.value,
      performedBy: caller.id,
    });

    const body: SkillLevelWriteResult = { studentId: params.id, skill: parsed.value.skill, ...result };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err, 'Could not save the level');
  }
}
