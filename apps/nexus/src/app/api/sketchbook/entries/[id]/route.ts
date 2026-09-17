import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getSketchbookSketch, hasAnyLiveFeature, repairPracticeDay } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { istDate } from '@/lib/sketchbook-rhythm';

/**
 * DELETE /api/sketchbook/entries/[id]   (the student who drew it)
 *
 * A featured sketch has been shown to a class; the teacher un-features it
 * first. The practice day is recounted from what remains.
 * A reviewed sketch stays: its review is part of the student's record.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const sketch = await getSketchbookSketch(params.id);
    if (!sketch) throw new ApiError('Sketch not found', 404);
    if (sketch.student_id !== caller.id) throw new ApiError('Not your sketch', 403);
    if (sketch.reviewed_at) {
      throw new ApiError('Your teacher has reviewed this sketch, so it stays in your sketchbook.', 409);
    }
    if (await hasAnyLiveFeature(sketch.id)) {
      throw new ApiError('This sketch is featured in a class. Ask your teacher to un-feature it first.', 409);
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from('drawing_submissions').delete().eq('id', sketch.id);
    if (error) throw error;
    await repairPracticeDay(caller.id, istDate(sketch.submitted_at), istDate);

    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not delete the sketch');
  }
}
