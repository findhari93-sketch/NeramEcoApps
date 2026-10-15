export const dynamic = 'force-dynamic';

/**
 * GET /api/college-hub/plans/history?college_id=<uuid> -> { plans: PlanWithCollege[] } (newest first)
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { planErrorResponse, planHistory } from '@/lib/college-plans/service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const collegeId = request.nextUrl.searchParams.get('college_id') ?? '';
  if (!UUID.test(collegeId)) return NextResponse.json({ error: 'college_id required' }, { status: 400 });
  try {
    const plans = await planHistory(collegeId);
    return NextResponse.json({ plans }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const { status, error } = planErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}
