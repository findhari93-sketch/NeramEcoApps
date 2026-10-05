import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import {
  getStudentQBStats,
  getTeacherQBStats,
  isKnownQBExamType,
  type QBExamRelevance,
  type QBStatsScope,
} from '@neram/database';

import { describeError } from '@/lib/api-errors';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroom_id') || null;

    // Verify QB access (enrollment + QB enabled for students)
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;
    const caller = access.caller;

    // exam_type counts one exam's papers (the exam pages); exam_relevance
    // matches both JEE papers at once and is kept for older callers.
    const examType = params.get('exam_type');
    const examRelevance = params.get('exam_relevance') || undefined;
    const scope: QBStatsScope | undefined = isKnownQBExamType(examType)
      ? { exam_type: examType }
      : (examRelevance as QBExamRelevance | undefined);

    // Teachers see stats for ALL questions; students see only active questions
    const isTeacher = ['teacher', 'admin'].includes(caller.user_type ?? '');
    const data = isTeacher
      ? await getTeacherQBStats(scope)
      : await getStudentQBStats(caller.id, scope);

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
