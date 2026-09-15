import { NextRequest, NextResponse } from 'next/server';
import { getInspirationItem, setInspirationSave } from '@neram/database/queries/nexus';
import { parseItemId, resolveInspirationCaller } from '@/lib/inspiration-access';
import { ApiError, errorResponse } from '@/lib/api-errors';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    const id = parseItemId(params.id);
    const { item } = await getInspirationItem(id, caller.user.id, caller.staff ? 'all' : 'visible');
    if (!item) throw new ApiError('Drawing not found', 404);
    await setInspirationSave(id, caller.user.id, true);
    return NextResponse.json({ saved: true }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not save this drawing');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    const id = parseItemId(params.id);
    // Student can unsave even if drawing is now hidden, so skip visibility check.
    await setInspirationSave(id, caller.user.id, false);
    return NextResponse.json({ saved: false }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not remove this drawing from saved');
  }
}
