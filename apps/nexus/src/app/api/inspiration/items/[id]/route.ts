import { NextRequest, NextResponse } from 'next/server';
import {
  deleteExemplar,
  getInspirationItem,
  getSimilarInspiration,
  hideInspirationByAuthor,
  updateInspirationItem,
} from '@neram/database/queries/nexus';
import { assertInspirationStaff, parseItemId, resolveInspirationCaller } from '@/lib/inspiration-access';
import { parseItemPatch } from '@/lib/inspiration-patch';
import { presentRow } from '@/lib/inspiration-present';
import { ApiError, errorResponse } from '@/lib/api-errors';

const NO_STORE = { 'Cache-Control': 'no-store' };
type Ctx = { params: { id: string } };

/** GET: one drawing, the other image of the same submission, and more like it. */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    const id = parseItemId(params.id);
    const [{ item, pair }, similar] = await Promise.all([
      getInspirationItem(id, caller.user.id, caller.staff ? 'all' : 'visible'),
      getSimilarInspiration(id, caller.user.id, 12),
    ]);
    if (!item) throw new ApiError('Drawing not found', 404);
    const opts = { staff: caller.staff };
    return NextResponse.json(
      {
        item: presentRow(item, opts),
        pair: pair ? presentRow(pair, opts) : null,
        similar: similar.map((row) => presentRow(row, opts)),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err, 'Could not load this drawing');
  }
}

/** PATCH (staff): show, hide, feature, retitle, or hide everything by one student. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    assertInspirationStaff(caller);
    const id = parseItemId(params.id);

    const { item } = await getInspirationItem(id, caller.user.id, 'all');
    if (!item) throw new ApiError('Drawing not found', 404);

    const { patch, hideAllByAuthor } = parseItemPatch(await request.json().catch(() => ({})), item.source_kind);
    // Validate everything before writing anything.
    if (hideAllByAuthor && !item.author_id) {
      throw new ApiError('This drawing is not linked to a student.', 400);
    }
    if (Object.keys(patch).length > 0) await updateInspirationItem(id, patch, caller.user.id);
    if (hideAllByAuthor && item.author_id) await hideInspirationByAuthor(item.author_id, caller.user.id);

    const { item: fresh } = await getInspirationItem(id, caller.user.id, 'all');
    return NextResponse.json({ item: fresh ? presentRow(fresh, { staff: true }) : null }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not change this drawing');
  }
}

/** DELETE (staff): exemplars only. A student's drawing is hidden, never deleted from here. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    assertInspirationStaff(caller);
    const id = parseItemId(params.id);
    const deleted = await deleteExemplar(id);
    if (!deleted) throw new ApiError('Only exemplars added by a teacher can be deleted.', 400);
    return NextResponse.json({ deleted: true }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not delete this exemplar');
  }
}
