import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getStudentAccuracy, listStudentAttempts } from '@neram/database';

/**
 * GET /api/student/tests/history?classroom=&limit=&test_id=
 *
 * Every attempt this student has submitted, across every surface. Possible only
 * since the cutover put chapter tests, class prep, catch-up and practice into
 * one attempt table; before that a student's record was split across six.
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const access = await verifyQBAccess(request.headers.get('Authorization'), params.get('classroom'));
    if (!access.ok) return access.response;

    const [attempts, accuracy] = await Promise.all([
      listStudentAttempts(access.caller.id, {
        limit: Number(params.get('limit')) || 50,
        testId: params.get('test_id') || undefined,
      }),
      getStudentAccuracy(access.caller.id),
    ]);

    return NextResponse.json({ data: { attempts, accuracy } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your results';
    console.error('Student test history error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
