/**
 * GET /api/question-bank/student-papers?classroom_id=<id>
 *
 * The whole paper grid in one call: every published paper, grouped by exam then
 * year, each carrying this student's progress across all three faces.
 *
 * One request rather than one per paper. The grid draws 26 cards; fanning out
 * would cost 26 function invocations every time a student opens the Question
 * Bank, which is the single most visited screen in the section.
 *
 * Kept in its own segment rather than under papers/**, because everything there
 * is staff-only and a student route buried among them is an accident waiting to
 * be copied.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, messageOf } from '@/lib/api-errors';
import { verifyQBAccess } from '@/lib/qb-auth';
import { listPapersForStudent } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    const groups = await listPapersForStudent(access.caller.id);
    return NextResponse.json({ data: { groups } });
  } catch (err) {
    const detail = messageOf(err);
    console.error('[QB Student Papers] GET:', detail, err);
    return errorResponse(err, 'Something went wrong.');
  }
}
