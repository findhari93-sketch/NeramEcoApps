import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent } from '@/lib/sketchbook-access';
import { istDate } from '@/lib/sketchbook-rhythm';
import { buildSketchbookPayload } from '@/lib/sketchbook-payload';
import { getSketchbookDrawing } from '@neram/database/queries/nexus';

/** GET /api/sketchbook/students/[id]?month=YYYY-MM&sketch=<id>   (staff who teach this student) */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    await assertStaffSeesStudent(caller, params.id);
    const today = istDate(new Date());
    const sketchId = request.nextUrl.searchParams.get('sketch');
    let monthParam = request.nextUrl.searchParams.get('month');
    if (sketchId) {
      const row = await getSketchbookDrawing(sketchId);
      if (!row || row.student_id !== params.id) throw new ApiError('Drawing not found', 404);
      monthParam = istDate(row.submitted_at).slice(0, 7);
    }
    const month = monthParam || today.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError('month must be YYYY-MM', 400);
    const payload = await buildSketchbookPayload(params.id, month, { summaryOnly: false, today, viewer: 'staff' });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load the sketchbook');
  }
}
