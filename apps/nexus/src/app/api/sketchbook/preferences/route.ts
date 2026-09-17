import { NextRequest, NextResponse } from 'next/server';
import { setDrawingSharingOptOut, setFeatureOptOut } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';

/**
 * PATCH /api/sketchbook/preferences   (student)
 * body { feature_opt_out?: boolean, share_drawings_opt_out?: boolean }
 *
 * feature_opt_out keeps a student's sketches out of Teams class posts.
 * share_drawings_opt_out keeps their drawings out of Inspiration for classmates.
 */
export async function PATCH(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    if (caller.user_type !== 'student') throw new ApiError('Only students keep a sketchbook.', 403);
    const body = await request.json().catch(() => ({}));
    const feature = body?.feature_opt_out;
    const share = body?.share_drawings_opt_out;
    if (typeof feature !== 'boolean' && typeof share !== 'boolean') {
      throw new ApiError('Send feature_opt_out or share_drawings_opt_out as true or false.', 400);
    }
    if (typeof feature === 'boolean') await setFeatureOptOut(caller.id, feature);
    if (typeof share === 'boolean') await setDrawingSharingOptOut(caller.id, share);
    return NextResponse.json(
      { feature_opt_out: typeof feature === 'boolean' ? feature : undefined, share_drawings_opt_out: typeof share === 'boolean' ? share : undefined },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorResponse(err, 'Could not save the preference');
  }
}
