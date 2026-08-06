/**
 * GET /api/question-bank/papers/overview?classroom_id=<id>
 *
 * Students down, papers across. One classroom at a time, because "how is my
 * class doing on the past papers" is the question this answers, and a matrix
 * over every student in the school answers nothing.
 *
 * Sits at a static segment beside papers/[id], which Next resolves in favour of
 * the static route, so /papers/overview never lands in the paper detail handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, messageOf } from '@/lib/api-errors';
import { verifyQBStaff } from '@/lib/qb-auth';
import { getPaperProgressMatrix } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    return NextResponse.json({ data: await getPaperProgressMatrix(classroomId) });
  } catch (err) {
    const detail = messageOf(err);
    console.error('[QB Papers Overview] GET:', detail, err);
    return errorResponse(err, 'Something went wrong.');
  }
}
