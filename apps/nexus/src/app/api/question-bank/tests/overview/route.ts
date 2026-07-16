import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { listTestsGroupedByContext } from '@neram/database';

/**
 * GET /api/question-bank/tests/overview   (teacher/admin)
 * Every active test categorized by where it is placed / what it links to:
 * Study chapters (nested by folder), Class Recaps, Foundation, Modules,
 * Classroom, Practice/Drafts. Powers the unified Tests hub.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can view the tests hub' }, { status: 403 });
    }
    const groups = await listTestsGroupedByContext();
    return NextResponse.json({ data: groups });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tests overview';
    console.error('QB tests overview GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
