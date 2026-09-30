import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { assertCapability, getRequestUser } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { staffStudentIds } from '@/lib/sketchbook-access';
import { loadDrawingLevels } from '@/lib/student-level-store';
import { loadRecentDrawings } from '@/lib/recent-drawings';
import { orderLevelQueue } from '@/lib/level-queue';
import type { LevelQueuePayload } from '@/lib/student-level-types';

const SINCE_DAYS = 90;
const PER_STUDENT = 6;

/**
 * GET /api/drawing-levels/queue?classroom=<id>   (managers and admins)
 *
 * Feeds the "Sort by drawing" screen: every tracked student in the classroom
 * (dormant students left out, like every other sketchbook list), their current
 * drawing level, and their last six drawings from the past 90 days.
 *
 * Order: students not rated yet come first, those with drawings before those
 * without (nothing to judge yet), then rated students, the longest-unrevisited
 * first. One request loads the whole class, so moving between students costs
 * nothing.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'coord.student.level');

    const ids = await staffStudentIds(caller, request.nextUrl.searchParams.get('classroom'));

    const [levels, drawings, namesRes] = await Promise.all([
      loadDrawingLevels(ids),
      loadRecentDrawings(ids, { perStudent: PER_STUDENT, sinceDays: SINCE_DAYS }),
      ids.length
        ? (getSupabaseAdminClient() as any).from('users').select('id, name').in('id', ids)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (namesRes.error) throw namesRes.error;
    const names = new Map<string, string | null>(
      ((namesRes.data ?? []) as { id: string; name: string | null }[]).map((u) => [u.id, u.name]),
    );

    const students = orderLevelQueue(
      ids.map((id) => ({
        id,
        name: names.get(id) ?? null,
        level: levels.get(id)?.level ?? null,
        setAt: levels.get(id)?.setAt ?? null,
        drawings: drawings[id] ?? [],
      })),
    );

    const body: LevelQueuePayload = { students, sinceDays: SINCE_DAYS };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load the students to sort');
  }
}
