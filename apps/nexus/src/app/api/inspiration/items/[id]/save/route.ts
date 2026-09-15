import { NextRequest, NextResponse } from 'next/server';
import { getInspirationItem, setInspirationSave } from '@neram/database/queries/nexus';
import { parseItemId, resolveInspirationCaller } from '@/lib/inspiration-access';
import { ApiError, errorResponse } from '@/lib/api-errors';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** POST saves, DELETE unsaves. Both are idempotent. A student can only save what they can see. */
async function save(request: NextRequest, rawId: string, saved: boolean) {
  const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
  const id = parseItemId(rawId);
  const { item } = await getInspirationItem(id, caller.user.id, caller.staff ? 'all' : 'visible');
  if (!item) throw new ApiError('Drawing not found', 404);
  await setInspirationSave(id, caller.user.id, saved);
  return NextResponse.json({ saved }, { headers: NO_STORE });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    return await save(request, params.id, true);
  } catch (err) {
    return errorResponse(err, 'Could not save this drawing');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    return await save(request, params.id, false);
  } catch (err) {
    return errorResponse(err, 'Could not remove this drawing from saved');
  }
}
