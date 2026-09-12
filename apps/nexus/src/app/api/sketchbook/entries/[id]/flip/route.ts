import { NextRequest, NextResponse } from 'next/server';
import { getSketchbookSketch, recordFlip } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent } from '@/lib/sketchbook-access';

/** POST /api/sketchbook/entries/[id]/flip  body { action: 'seen' | 'skipped' }   (staff) */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const action = body?.action === 'skipped' ? 'skipped' : body?.action === 'seen' ? 'seen' : null;
    if (!action) throw new ApiError('action must be seen or skipped', 400);
    const sketch = await getSketchbookSketch(params.id);
    if (!sketch) throw new ApiError('Sketch not found', 404);
    await assertStaffSeesStudent(caller, sketch.student_id);
    await recordFlip(caller.id, sketch.id, action);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not record the flip');
  }
}
