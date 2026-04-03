import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getQBCategoryCounts } from '@neram/database';
import type { QBExamType } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroom_id') || null;

    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    const examType = params.get('exam_type') as QBExamType | null;
    const year = params.get('year') ? parseInt(params.get('year')!, 10) : undefined;
    const session = params.get('session') || undefined;

    const counts = await getQBCategoryCounts(
      examType ? { exam_type: examType, source_year: year, source_session: session } : undefined,
    );

    return NextResponse.json({ data: counts }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Category counts error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
