import { NextRequest, NextResponse } from 'next/server';
import { listItemsNeedingImages } from '@neram/database/queries/nexus';
import { assertInspirationStaff, resolveInspirationCaller } from '@/lib/inspiration-access';
import { prepareItemImage } from '@/lib/inspiration-images';
import { errorResponse } from '@/lib/api-errors';

export const maxDuration = 60;

const BATCH = 10;
const BUDGET_MS = 45_000;
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * POST /api/inspiration/maintenance/images   (staff)
 *
 * Fills missing thumbnails and shapes, ten visible items per call. The teacher
 * Inspiration page calls it in a short loop on load, which is how the backfill
 * of existing drawings happens without a script or a cron.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    assertInspirationStaff(caller);

    const { items, remaining } = await listItemsNeedingImages(BATCH);
    const started = Date.now();
    let processed = 0;
    for (const item of items) {
      if (Date.now() - started > BUDGET_MS) break;
      try {
        await prepareItemImage(item);
      } catch (err) {
        console.warn(`[inspiration] image prep failed for ${item.id}:`, err instanceof Error ? err.message : err);
      }
      // A parked item has left the queue too.
      processed += 1;
    }

    return NextResponse.json({ processed, remaining: Math.max(remaining - processed, 0) }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not prepare images');
  }
}
