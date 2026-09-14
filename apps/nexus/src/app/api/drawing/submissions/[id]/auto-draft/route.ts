/**
 * POST /api/drawing/submissions/[id]/auto-draft
 * Body (optional): { force?: boolean }
 *
 * Turn one submitted drawing upright and draft it. Fired by the student's
 * phone, without waiting, right after a submission lands, so the draft is
 * usually ready before a teacher opens the sheet. Staff may call it too, and
 * only staff may pass force (replace an existing draft).
 *
 * Always answers 200 with the outcome for an allowed caller, because the
 * phone never reads it: { state, reason?, rotatedDeg?, tags?, evaluationId?, mode? }.
 * See lib/drawing-auto-draft.ts for the states.
 *
 * No after() or waitUntil in Next 14.2, so the work is awaited inside the
 * request. The phone sends it with keepalive, so closing the sheet does not
 * cancel it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

import { errorResponse } from '@/lib/api-errors';
import { runAutoDraft } from '@/lib/drawing-auto-draft';
import { getRequestUser } from '@/lib/study-materials';

/** Orientation check, one evaluation (up to two model attempts) and two image downloads. */
export const maxDuration = 300;

const STAFF_TYPES = ['teacher', 'admin'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;

    const admin = getSupabaseAdminClient() as any;
    const isStaff = STAFF_TYPES.includes(user.user_type ?? '');

    if (!isStaff) {
      const { data: submission } = await admin
        .from('drawing_submissions')
        .select('id, student_id')
        .eq('id', id)
        .maybeSingle();
      if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
      if (submission.student_id !== user.id) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
      if (force) {
        return NextResponse.json({ error: 'Only a teacher can draft a sheet again.' }, { status: 403 });
      }
    }

    const result = await runAutoDraft(admin, id, { actorId: user.id, force });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, 'Could not draft this drawing');
  }
}
