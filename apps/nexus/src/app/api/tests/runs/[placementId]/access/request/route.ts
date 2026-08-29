import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getLiveAccessRequest,
  getPlacementById,
  getSupabaseAdminClient,
  requestTestAccess,
} from '@neram/database';

/**
 * POST /api/tests/runs/[placementId]/access/request   (student)
 * GET  /api/tests/runs/[placementId]/access/request   (student) where their ask stands
 *
 * A student asks to be let back into a class test that has closed.
 *
 * Deliberately NOT behind verifyQBAccess: that gates students on whether the
 * question bank is switched on for their classroom, which has nothing to do
 * with a class test their teacher set. Using it would silently refuse the ask
 * for whole classrooms.
 *
 * The student id comes from the verified token and never from the body, so one
 * student cannot open a door in another student's name.
 */
async function resolveStudent(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
  return data as { id: string } | null;
}

export async function GET(request: NextRequest, { params }: { params: { placementId: string } }) {
  try {
    const student = await resolveStudent(request);
    if (!student) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const row = await getLiveAccessRequest(params.placementId, student.id);
    return NextResponse.json(
      { data: { request: row } },
      { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load your request';
    console.error('Test access request read error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { placementId: string } }) {
  try {
    const student = await resolveStudent(request);
    if (!student) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const placement = await getPlacementById(params.placementId, getSupabaseAdminClient());
    if (!placement || !(placement as any).is_active) {
      return NextResponse.json({ error: 'That test is no longer set' }, { status: 404 });
    }
    // Only a class test can be asked about. An exam has its own makeup flow with
    // its own audit trail, and a practice pool never closes in the first place.
    if ((placement as any).context_type !== 'class_test') {
      return NextResponse.json(
        { error: 'This test cannot be reopened by request. Ask your teacher directly.' },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { request: row, alreadyLive } = await requestTestAccess({
      placementId: params.placementId,
      studentId: student.id,
      note: typeof body?.note === 'string' ? body.note.slice(0, 500) : null,
    });

    return NextResponse.json({
      data: {
        request: row,
        // Not an error. They have already asked, or they already hold a window
        // and have not noticed, and telling them off for either would be odd.
        already: alreadyLive,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send your request';
    console.error('Test access request error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
