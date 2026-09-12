import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { istDate } from '@/lib/sketchbook-rhythm';
import { buildSketchbookPayload } from '@/lib/sketchbook-payload';

/** GET /api/sketchbook/me?month=YYYY-MM&summary=1   (student) */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    if (caller.user_type !== 'student') throw new ApiError('Only students keep a sketchbook.', 403);
    const today = istDate(new Date());
    const month = request.nextUrl.searchParams.get('month') || today.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError('month must be YYYY-MM', 400);
    const summaryOnly = request.nextUrl.searchParams.get('summary') === '1';
    const payload = await buildSketchbookPayload(caller.id, month, { summaryOnly, today });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load your sketchbook');
  }
}
