import { NextRequest, NextResponse } from 'next/server';
import { createExemplar } from '@neram/database/queries/nexus';
import { assertInspirationStaff, resolveInspirationCaller } from '@/lib/inspiration-access';
import { prepareItemImage } from '@/lib/inspiration-images';
import { parseExemplarInput } from '@/lib/inspiration-patch';
import { errorResponse } from '@/lib/api-errors';

export const maxDuration = 30;

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * POST /api/inspiration/exemplars   (staff)
 * body { image_url, title, brief, type_slugs, exam_types, paper_years }
 *
 * The image is already uploaded (POST /api/drawing/upload, bucket
 * drawing-references). Visible to students at once: a teacher chose it.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    assertInspirationStaff(caller);
    const input = parseExemplarInput(await request.json().catch(() => ({})));
    const id = await createExemplar(input, caller.user.id);
    // Best effort: a failure parks the item, and the maintenance batch never retries forever.
    await prepareItemImage({ id, image_url: input.image_url, thumbnail_url: null, image_aspect: null }).catch((err) =>
      console.warn(`[inspiration] exemplar image prep failed for ${id}:`, err instanceof Error ? err.message : err),
    );
    return NextResponse.json({ id }, { status: 201, headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not add the exemplar');
  }
}
