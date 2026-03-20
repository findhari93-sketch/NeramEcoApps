import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getStudentQBStats, getTeacherQBStats, type QBExamRelevance } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroom_id') || null;

    // Verify QB access (enrollment + QB enabled for students)
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;
    const caller = access.caller;

    const examRelevance = params.get('exam_relevance') || undefined;

    // Teachers see stats for ALL questions; students see only active questions
    const isTeacher = ['teacher', 'admin'].includes(caller.user_type ?? '');
    const data = isTeacher
      ? await getTeacherQBStats(examRelevance as QBExamRelevance | undefined)
      : await getStudentQBStats(caller.id, examRelevance as QBExamRelevance | undefined);

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
