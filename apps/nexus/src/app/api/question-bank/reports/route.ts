import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccessAnyClassroom } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { getQBReportQueue, getStudentQBReports, type QBReportQueueFilter } from '@neram/database';
import { describeError } from '@/lib/api-errors';

/**
 * GET /api/question-bank/reports
 *
 * Staff: the Reports queue, grouped into problems, with counts for the stat
 * cards (?status=open|resolved|dismissed, open by default). Managers count as
 * staff here; the old `['teacher','admin'].includes(user_type)` check refused them.
 *
 * Students: their own reports, with the paper and number to recognise each by
 * and what came of it.
 */

const FILTERS: QBReportQueueFilter[] = ['open', 'resolved', 'dismissed'];

export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccessAnyClassroom(request.headers.get('Authorization'));
    if (!access.ok) return access.response;
    const caller = access.caller;

    if (resolveStaffRole(caller) !== null) {
      const asked = request.nextUrl.searchParams.get('status') as QBReportQueueFilter | null;
      const filter = asked && FILTERS.includes(asked) ? asked : 'open';
      const { items, counts } = await getQBReportQueue(filter);
      return NextResponse.json({ data: items, counts });
    }

    const reports = await getStudentQBReports(caller.id);
    return NextResponse.json({ data: reports });
  } catch (err) {
    console.error('[QB API] Reports list error:', describeError(err));
    return NextResponse.json({ error: 'Could not load reports' }, { status: 500 });
  }
}
