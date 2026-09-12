import { NextRequest, NextResponse } from 'next/server';
import { setFeatureOptOut } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';

/** PATCH /api/sketchbook/preferences  body { feature_opt_out: boolean }   (student) */
export async function PATCH(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    if (caller.user_type !== 'student') throw new ApiError('Only students keep a sketchbook.', 403);
    const body = await request.json().catch(() => ({}));
    if (typeof body?.feature_opt_out !== 'boolean') throw new ApiError('feature_opt_out must be a boolean', 400);
    await setFeatureOptOut(caller.id, body.feature_opt_out);
    return NextResponse.json({ feature_opt_out: body.feature_opt_out }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not save the preference');
  }
}
