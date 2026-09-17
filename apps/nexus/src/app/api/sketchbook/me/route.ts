import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { istDate } from '@/lib/sketchbook-rhythm';
import { buildSketchbookPayload } from '@/lib/sketchbook-payload';
import { getSketchbookDrawing } from '@neram/database/queries/nexus';

/** GET /api/sketchbook/me?month=YYYY-MM&summary=1&sketch=<id>   (student: every drawing except test papers) */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    if (caller.user_type !== 'student') throw new ApiError('Only students keep a sketchbook.', 403);
    const today = istDate(new Date());
    const sketchId = request.nextUrl.searchParams.get('sketch');
    let monthParam = request.nextUrl.searchParams.get('month');
    if (sketchId) {
      const row = await getSketchbookDrawing(sketchId);
      // Their own drawing only, and never a test paper (its marks are embargoed).
      if (!row || row.student_id !== caller.id || row.source_type === 'exam') throw new ApiError('Drawing not found', 404);
      monthParam = istDate(row.submitted_at).slice(0, 7);
    }
    const month = monthParam || today.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError('month must be YYYY-MM', 400);
    const summaryOnly = request.nextUrl.searchParams.get('summary') === '1';
    const payload = await buildSketchbookPayload(caller.id, month, { summaryOnly, today, viewer: 'student' });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load your sketchbook');
  }
}
