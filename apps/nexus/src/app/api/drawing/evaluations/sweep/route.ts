/**
 * POST /api/drawing/evaluations/sweep  (teacher or admin)
 *
 * Draft the oldest waiting drawings that have no draft yet, a few per call.
 *
 * Most sheets are drafted the moment the student submits (the phone fires
 * /api/drawing/submissions/[id]/auto-draft). This catches everything else:
 * exam drawings, a phone that lost signal, a run that died, and every sheet
 * that was already waiting before automatic drafting existed. The Drawing
 * Reviews queue calls it once when it opens.
 *
 * Deliberately not a cron, like the photo auto-check: a missing draft never
 * blocks anyone, a teacher can always review by hand, and the next teacher who
 * opens the queue clears a few more. Bounded per call so one request stays
 * inside its time budget.
 *
 * Answers { processed, results: [{ id, state }], blocked }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

import { errorResponse } from '@/lib/api-errors';
import { runSweep } from '@/lib/drawing-auto-draft';
import { getRequestUser } from '@/lib/study-materials';

/** Six sheets, two at a time, each up to about a minute. */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (!['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const admin = getSupabaseAdminClient() as any;
    const result = await runSweep(admin, { actorId: user.id });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, 'Could not draft the waiting drawings');
  }
}
