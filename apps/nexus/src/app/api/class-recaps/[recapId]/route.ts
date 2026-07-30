import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import {
  getRecapById,
  setRecapStatus,
  refreshRecapMedia,
  setRecapVideoSource,
  buildClassTestFromRecap,
} from '@neram/database';

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
 * Body: { action: 'publish' | 'unpublish' | 'archive' | 'refresh_media' | 'set_video_source', video_source? }
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

    if (action === 'set_video_source') {
      const source = body.video_source === 'youtube' ? 'youtube' : 'sharepoint';
      const recap = await setRecapVideoSource(recapId, source);
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

    // Publishing is the moment a class becomes catchable, so it is also the
    // moment it needs the test that proves someone watched it. Building it here
    // rather than behind a second button is the difference between one click per
    // class and two, and the second one was never being pressed.
    //
    // Best effort on purpose. A recap with too few checkpoint questions throws
    // NO_CHECKPOINT_QUESTIONS, and refusing to publish over that would leave the
    // recording unreachable as well as unquizzed. The warning rides back on the
    // response so the editor can say what is missing.
    let classTest: unknown = null;
    let classTestWarning: string | null = null;
    if (next === 'published') {
      try {
        classTest = await buildClassTestFromRecap(recapId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        classTestWarning =
          message === 'NO_CHECKPOINT_QUESTIONS'
            ? 'Published, but there is no class test yet. Add checkpoint questions and publish again.'
            : message === 'RECAP_HAS_NO_CLASS'
              ? 'Published. This recap is not linked to a scheduled class, so it has no class test.'
              : `Published, but the class test could not be built: ${message}`;
        console.warn(`[recap ${recapId}] class test build failed:`, message);
      }
    }

    return NextResponse.json({ recap, classTest, classTestWarning });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update recap';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
