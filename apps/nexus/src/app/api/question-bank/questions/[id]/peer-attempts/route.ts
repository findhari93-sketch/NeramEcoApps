import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccessAnyClassroom } from '@/lib/qb-auth';
import { getStudentQBDrawingState, listQBPeerAttempts } from '@neram/database';
import { inspirationEnabledFor } from '@/lib/inspiration-access';
import { presentRow } from '@/lib/inspiration-present';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { describeError } from '@/lib/api-errors';

/**
 * "See how others drew this": other students' attempts at one bank drawing.
 *
 * THE GATE IS DECIDED HERE
 *
 * Locked until the student has uploaded their own attempt, or has explicitly
 * chosen to look first, which is recorded and shown on whatever they draw
 * afterwards. Exactly the shape of the solution gate, and for the same reason:
 * in the exam they get a question they have never seen, so drawing blind is
 * the skill being built, but a student who has never seen what a good answer
 * looks like may never start.
 *
 * `total` is sent even while locked, and no image with it. "Nobody has drawn
 * this yet" and "four people have drawn this" are different invitations, and
 * neither one is somebody's drawing.
 *
 * Every rule about WHOSE work may be shown lives in nexus_qb_peer_attempts, on
 * top of nexus_inspiration_base: the author's opt-out, the curation state and
 * the four star bar. presentRow then decides what may be said about it, and
 * gives a student none of the teacher fields.
 *
 * Not classroom scoped, like the other three drawing routes here. See the note
 * in drawing-state/route.ts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: questionId } = await params;
    const partId = request.nextUrl.searchParams.get('part') || '';

    const authHeader = request.headers.get('Authorization');
    const access = await verifyQBAccessAnyClassroom(authHeader);
    if (!access.ok) return access.response;

    const staff = resolveStaffRole(access.caller) !== null;

    // The same switch that hides the Inspiration tab. With it off no drawing
    // and no student's name leaves the server, rather than a hidden button
    // over a route that still answers.
    if (!(await inspirationEnabledFor(authHeader, staff))) {
      return NextResponse.json({ error: 'This is not available yet.' }, { status: 404 });
    }

    // A teacher is not practising, so there is nothing for them to earn. They
    // see the same list to know what their students are looking at.
    const unlocked =
      staff ||
      (await getStudentQBDrawingState(questionId, access.caller.id, { partId })).peers_unlocked;

    const result = await listQBPeerAttempts(questionId, partId, access.caller.id, {
      scope: staff ? 'all' : 'visible',
    });

    return NextResponse.json(
      {
        data: {
          locked: !unlocked,
          total: result.total,
          items: unlocked ? result.rows.map((row) => presentRow(row, { staff })) : [],
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB peer attempts] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
