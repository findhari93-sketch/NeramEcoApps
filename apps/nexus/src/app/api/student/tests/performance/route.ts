import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getStudentAccuracy, getStudentPerformanceSummary, listStudentAttempts } from '@neram/database';

/**
 * GET /api/student/tests/performance?classroom=
 *
 * The student's lifetime performance rollup for the My Performance tab: total
 * tests attempted, overall average, a month-by-month trend split by
 * practice/class/exam, and the individual attempt rows behind it.
 *
 * `classroom` is accepted only for verifyQBAccess's permission check, the same
 * as /history. This is a lifetime, cross-classroom view, not one scoped to a
 * single class, matching how /history already behaves.
 *
 * Called lazily from the client the first time the Performance tab is opened,
 * never on initial page load alongside /overview: the monthly rollup is the
 * one genuinely expensive read in this feature and most visits never open
 * this tab.
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const access = await verifyQBAccess(request.headers.get('Authorization'), params.get('classroom'));
    if (!access.ok) return access.response;

    const [summary, attempts, accuracy] = await Promise.all([
      getStudentPerformanceSummary(access.caller.id),
      // The 500 ceiling is the dashboard's own use case: a year of a busy
      // student's attempts, not the 25-default the recent-results widgets want.
      listStudentAttempts(access.caller.id, { limit: 500 }),
      getStudentAccuracy(access.caller.id),
    ]);

    return NextResponse.json({ data: { summary, attempts, accuracy } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your performance';
    console.error('Student test performance error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
