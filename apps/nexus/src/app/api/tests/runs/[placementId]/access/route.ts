import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import {
  decideTestAccessRequest,
  getPlacementById,
  getSupabaseAdminClient,
  loadAccessRequestsForRun,
  setTestAccessForStudent,
} from '@neram/database';
import { notifyStudentAccessDecision } from '@/lib/test-access-notify';

/**
 * GET   /api/tests/runs/[placementId]/access   (staff) who is waiting, who holds a window
 * POST  /api/tests/runs/[placementId]/access   (staff) open or close it for one student
 * PATCH /api/tests/runs/[placementId]/access   (staff) answer one student's request
 *
 * The teacher half of the reopen flow. A class test now shuts at its due date,
 * which is only safe because a shut-out student has a way back in. This is that
 * door; the student's own ask is in ./request.
 *
 * verifyQBAccess short-circuits for staff before it checks question-bank
 * enablement, so it is safe here even for a classroom with the bank switched
 * off. That is also why the student route does NOT use it.
 */
async function requireStaff(request: NextRequest) {
  const access = await verifyQBAccess(request.headers.get('Authorization'), null);
  if (!access.ok) return { ok: false as const, response: access.response };
  if (resolveStaffRole(access.caller) === null) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Only staff can change test access' }, { status: 403 }),
    };
  }
  return { ok: true as const, caller: access.caller };
}

export async function GET(request: NextRequest, { params }: { params: { placementId: string } }) {
  try {
    const staff = await requireStaff(request);
    if (!staff.ok) return staff.response;

    const rows = await loadAccessRequestsForRun(params.placementId);
    return NextResponse.json(
      { data: { requests: rows } },
      { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load access requests';
    console.error('Test run access error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { placementId: string } }) {
  try {
    const staff = await requireStaff(request);
    if (!staff.ok) return staff.response;

    const body = await request.json().catch(() => ({}));
    const studentId = String(body?.student_id || '').trim();
    const action = body?.action === 'close' ? 'close' : 'open';
    if (!studentId) return NextResponse.json({ error: 'Which student?' }, { status: 400 });

    const placement = await getPlacementById(params.placementId, getSupabaseAdminClient());
    if (!placement) return NextResponse.json({ error: 'That run no longer exists' }, { status: 404 });

    const row = await setTestAccessForStudent({
      placementId: params.placementId,
      studentId,
      action,
      closesAt: body?.closes_at ?? null,
      note: body?.note ?? null,
      actorId: (staff.caller as any).id ?? null,
    });

    // Told, not left to discover. Before this, a student learned their test had
    // been reopened only by going back and trying it again, which is why the
    // same student asks twice.
    if (action === 'open') {
      await notifyStudentAccessDecision({
        studentId,
        testId: (placement as any).test_id,
        placementId: params.placementId,
        testTitle: await readTestTitle((placement as any).test_id),
        decision: 'granted',
        closesAt: row?.closes_at ?? null,
      });
    }

    return NextResponse.json({ data: { request: row } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to change access';
    console.error('Test run access change error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Approve or decline one student's request. */
export async function PATCH(request: NextRequest, { params }: { params: { placementId: string } }) {
  try {
    const staff = await requireStaff(request);
    if (!staff.ok) return staff.response;

    const body = await request.json().catch(() => ({}));
    const requestId = String(body?.request_id || '').trim();
    const decision = body?.decision === 'declined' ? 'declined' : 'granted';
    if (!requestId) return NextResponse.json({ error: 'Which request?' }, { status: 400 });

    const row = await decideTestAccessRequest({
      requestId,
      decision,
      closesAt: body?.closes_at ?? null,
      note: body?.note ?? null,
      decidedBy: (staff.caller as any).id ?? null,
    });

    // A decline is worth telling them about too. A student who asked and hears
    // nothing assumes the ask was lost and asks again.
    const placement = await getPlacementById(params.placementId, getSupabaseAdminClient());
    await notifyStudentAccessDecision({
      studentId: row.student_id,
      testId: (placement as any)?.test_id ?? '',
      placementId: params.placementId,
      testTitle: await readTestTitle((placement as any)?.test_id),
      decision,
      closesAt: row.closes_at,
      note: row.decision_note,
    });

    return NextResponse.json({ data: { request: row } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to answer that request';
    console.error('Test run access decision error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** The paper's name, for a message a student can act on. Never fatal. */
async function readTestTitle(testId: string | null | undefined): Promise<string | null> {
  if (!testId) return null;
  try {
    const supabase = getSupabaseAdminClient() as any;
    const { data } = await supabase.from('nexus_tests').select('title').eq('id', testId).maybeSingle();
    return (data as any)?.title ?? null;
  } catch {
    return null;
  }
}
