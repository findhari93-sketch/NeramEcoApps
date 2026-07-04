import { NextRequest, NextResponse } from 'next/server';
import {
  listSharedTracksForStudent,
  getCatchupItem,
  updateCatchupItemStatus,
  listTrackItemPositions,
} from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * GET /api/student/catchup  — the signed-in student's shared catch-up tracks,
 * with topic summaries, resources and linked quizzes. Students only ever see
 * their own tracks, and only after a teacher shared them.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const tracks = await listSharedTracksForStudent(user.id);
    return NextResponse.json({ tracks });
  } catch (err) {
    return errorResponse(err, 'Failed to load catch-up');
  }
}

/**
 * POST /api/student/catchup
 * body { item_id, status: 'done' | 'todo' }
 * Ownership-checked; items unlock sequentially (item N needs N-1 done).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const body = await request.json();
    if (!body.item_id || !['done', 'todo'].includes(body.status)) {
      return NextResponse.json({ error: 'item_id and status are required' }, { status: 400 });
    }

    const item = await getCatchupItem(body.item_id);
    if (!item || !item.track || item.track.student_id !== user.id || !item.track.shared_at) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (body.status === 'done') {
      const positions = await listTrackItemPositions(item.track_id);
      const idx = positions.findIndex((p) => p.id === item.id);
      const previousDone = positions.slice(0, idx).every((p) => p.status === 'done');
      if (!previousDone) {
        return NextResponse.json(
          { error: 'Finish the earlier topics first to unlock this one' },
          { status: 400 },
        );
      }
    }

    const updated = await updateCatchupItemStatus(item.id, body.status);
    return NextResponse.json({ item: updated });
  } catch (err) {
    return errorResponse(err, 'Failed to save');
  }
}
