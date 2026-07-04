import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { getRecapById, setRecapStatus, refreshRecapMedia } from '@neram/database';

/**
 * GET /api/class-recaps/[recapId]
 * Teacher: full recap with sections + questions (answers included, for review/edit).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const { recapId } = await params;
    const recap = await getRecapById(recapId);
    if (!recap) return NextResponse.json({ error: 'Recap not found' }, { status: 404 });
    return NextResponse.json({ recap });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load recap';
    const status = message === 'Not authorized' ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH /api/class-recaps/[recapId]
 * Body: { action: 'publish' | 'unpublish' | 'archive' | 'refresh_media' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const { recapId } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body.action as string;

    if (action === 'refresh_media') {
      const recap = await refreshRecapMedia(recapId);
      return NextResponse.json({ recap });
    }

    const statusMap: Record<string, 'draft' | 'published' | 'archived'> = {
      publish: 'published',
      unpublish: 'draft',
      archive: 'archived',
    };
    const next = statusMap[action];
    if (!next) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    const recap = await setRecapStatus(recapId, next);
    return NextResponse.json({ recap });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update recap';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
