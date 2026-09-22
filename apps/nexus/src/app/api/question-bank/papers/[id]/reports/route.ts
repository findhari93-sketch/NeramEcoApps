import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { getPaperQBReports } from '@neram/database';
import { describeError } from '@/lib/api-errors';

/**
 * GET /api/question-bank/papers/[id]/reports
 *
 * Open student reports on this paper's questions, grouped into problems and
 * keyed by question id: the "Reported" chip, the row flag and the panel in
 * the question pane all read this one response.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;
    const data = await getPaperQBReports(params.id);
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[QB API] Paper reports error:', describeError(err));
    return NextResponse.json({ error: 'Could not load reports for this paper' }, { status: 500 });
  }
}
