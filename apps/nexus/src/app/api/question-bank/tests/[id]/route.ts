import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getTestMeta, getComposedTestQuestions, listPlacementsForTest } from '@neram/database';

/**
 * GET /api/question-bank/tests/[id]   (teacher/admin)
 * Full test + questions (with answers) for editing/preview.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can view test details' }, { status: 403 });
    }

    const meta = await getTestMeta(params.id);
    if (!meta) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    const [questions, placements] = await Promise.all([
      getComposedTestQuestions(params.id, true),
      listPlacementsForTest(params.id),
    ]);

    return NextResponse.json({ data: { test: meta, questions, placements } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load test';
    console.error('QB test GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
