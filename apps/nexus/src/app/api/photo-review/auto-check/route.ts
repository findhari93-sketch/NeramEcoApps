import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { loadPhotoRoster, type PhotoRosterUser } from '@/lib/photo-review-roster';
import { needsFaceCheck } from '@/lib/photo-auto-review';
import { runFaceCheck, type FaceCheckOutcome } from '@/lib/photo-face-check';

export const dynamic = 'force-dynamic';
/** A full batch is MAX_PER_CALL Gemini calls at CONCURRENCY at a time. */
export const maxDuration = 60;

/**
 * POST /api/photo-review/auto-check  (staff)
 * Body: { classroomId: string }
 *
 * Run the automatic face check over this classroom's pending photos that have
 * not been checked yet, approving the clear ones.
 *
 * Most photos are checked the moment a student uploads them (api/profile/avatar).
 * This is for everything that arrives another way: a photo pulled from
 * Microsoft by the teacher's "Check Microsoft" button or by the Admin weekly
 * sync, a check that timed out during an upload, and anything waiting from
 * before the check existed. The review page calls it when it opens and right
 * after a Microsoft check, and loops while `remaining` is above zero.
 *
 * Bounded per call so one request stays inside the time budget; the page asks
 * again for the rest. Deliberately not a cron: a pending photo never blocks a
 * student, and the next teacher who opens the page clears it in seconds.
 */

const MAX_PER_CALL = 12;
const CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const staff = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(staff);

    const body = await request.json().catch(() => ({}));
    const classroomId = typeof body?.classroomId === 'string' ? body.classroomId : '';
    if (!classroomId) {
      return NextResponse.json({ error: 'classroomId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const roster = await loadPhotoRoster(supabase, classroomId);

    const now = new Date();
    const due = roster.filter((u) => needsFaceCheck(u, now));
    const batch = due.slice(0, MAX_PER_CALL);

    const outcomes = await mapWithConcurrency<PhotoRosterUser, FaceCheckOutcome>(
      batch,
      CONCURRENCY,
      (u) => runFaceCheck(u.id, { actorId: staff.id, supabase }),
    );

    const count = (status: FaceCheckOutcome['status']) =>
      outcomes.filter((o) => o.status === status).length;

    return NextResponse.json({
      /** Photos this call settled. The page stops looping on a round of zero. */
      checked: outcomes.filter((o) => o.recorded).length,
      approved: count('approved'),
      keptForReview: count('kept_pending'),
      failed: count('failed'),
      /** The AI controls refused (switched off or over budget). Stop asking. */
      blocked: outcomes.some((o) => o.status === 'blocked'),
      /** Still waiting beyond this batch. */
      remaining: due.length - batch.length,
    });
  } catch (err) {
    return errorResponse(err, 'Could not check the photos');
  }
}
