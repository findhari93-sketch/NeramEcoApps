import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccessAnyClassroom } from '@/lib/qb-auth';
import { getQBReportStatus } from '@neram/database';
import { describeError } from '@/lib/api-errors';

/**
 * GET /api/question-bank/report-status?question_ids=a,b,c
 *
 * For each question: the viewer's own open reports (so "Report a mistake"
 * becomes "You reported this"), and the parts 2 or more students have
 * reported, which every student is warned about. Never who reported them.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A test review is the biggest caller: 80 questions, 200 leaves room. */
const MAX_IDS = 200;

export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccessAnyClassroom(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const ids = Array.from(
      new Set(
        (request.nextUrl.searchParams.get('question_ids') || '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => UUID.test(s)),
      ),
    ).slice(0, MAX_IDS);
    if (ids.length === 0) return NextResponse.json({ data: {} });

    const data = await getQBReportStatus(ids, access.caller.id);
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[QB API] Report status error:', describeError(err));
    return NextResponse.json({ error: 'Could not load report status' }, { status: 500 });
  }
}
