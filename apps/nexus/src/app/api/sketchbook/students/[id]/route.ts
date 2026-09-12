import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent } from '@/lib/sketchbook-access';
import { istDate } from '@/lib/sketchbook-rhythm';
import { buildSketchbookPayload } from '@/lib/sketchbook-payload';

/** GET /api/sketchbook/students/[id]?month=YYYY-MM   (staff who teach this student) */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    await assertStaffSeesStudent(caller, params.id);
    const today = istDate(new Date());
    const month = request.nextUrl.searchParams.get('month') || today.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError('month must be YYYY-MM', 400);
    const payload = await buildSketchbookPayload(params.id, month, { summaryOnly: false, today });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load the sketchbook');
  }
}
