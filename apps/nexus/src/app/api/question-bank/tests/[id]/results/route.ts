import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { getQuestionAnalysis, getTestResults } from '@neram/database';

/**
 * GET /api/question-bank/tests/[id]/results   (staff)
 *
 * Who sat the test and how they did, plus the per-question breakdown.
 *
 * The question breakdown is the part that matters at scale: a question almost
 * nobody gets right is usually ambiguous rather than hard, and without this the
 * bank quietly accumulates broken questions nobody can find.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can see test results' }, { status: 403 });
    }

    const [results, questions] = await Promise.all([
      getTestResults(params.id),
      getQuestionAnalysis(params.id),
    ]);

    return NextResponse.json({
      data: { rows: results.rows, stats: results.stats, questions },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load results';
    console.error('Test results error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
