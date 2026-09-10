import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { getPlacementById, getSupabaseAdminClient, setTestAccessForStudent } from '@neram/database';
import { notifyStudentAccessDecision } from '@/lib/test-access-notify';
import { resolveRunRoster } from '@/lib/run-roster';

/**
 * POST /api/tests/runs/[placementId]/access/bulk            (staff)
 * Body: { student_ids: string[], action: 'open' | 'close', closes_at?, note? }
 *
 * Reopen (or close) one run for a selected group in a single press. The teacher
 * filters the results tab to "Not done" or "Below pass", selects all of them,
 * and acts once, instead of clicking twenty rows.
 *
 * It writes through setTestAccessForStudent, exactly as the single-student route
 * does, and that is deliberate rather than convenient. Exam windows are decided
 * in one place (resolveExamWindowForStudent reads the grant), so reusing the one
 * writer is what keeps a bulk grant from becoming the second kind of grant that
 * the attempt route has never heard of. The last time two paths disagreed about
 * this, the roster showed a live window and the student was still refused at the
 * door: silent success, the worst failure shape available.
 *
 * The id list NARROWS, it never widens. Ids are intersected with the run's
 * roster before anything is written, so a staff caller cannot reach a student
 * outside the classroom by posting their id.
 */

interface Ctx {
  params: { placementId: string };
}

// One Graph-free notification and one row per student, over a selection that can
// be a whole class. The default budget is not enough at forty.
export const maxDuration = 120;

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

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const staff = await requireStaff(request);
    if (!staff.ok) return staff.response;

    const body = await request.json().catch(() => ({}) as any);
    const requested: string[] = Array.isArray(body?.student_ids)
      ? body.student_ids.filter((x: unknown) => typeof x === 'string' && x.trim())
      : [];
    const action = body?.action === 'close' ? 'close' : 'open';

    if (requested.length === 0) {
      return NextResponse.json({ error: 'Nobody was selected.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const placement = await getPlacementById(params.placementId, supabase);
    if (!placement) {
      return NextResponse.json({ error: 'That run no longer exists' }, { status: 404 });
    }

    const roster = await resolveRunRoster(placement as any, supabase);
    if (roster === null) {
      return NextResponse.json(
        { error: 'This run has no roster, so it cannot be reopened for a group.' },
        { status: 400 },
      );
    }

    const targets = requested.filter((id) => roster.has(id));
    if (targets.length === 0) {
      return NextResponse.json(
        { error: 'None of those students are on this run.' },
        { status: 400 },
      );
    }

    const testTitle = await readTestTitle((placement as any).test_id, supabase);

    // Sequential rather than Promise.all: each student is one write plus one
    // notification, and a selection can be a whole class. Forty parallel Graph
    // calls is how the activity-feed tier starts throttling.
    const results: Array<{ student_id: string; ok: boolean; reason?: string }> = [];
    for (const studentId of targets) {
      try {
        const row = await setTestAccessForStudent({
          placementId: params.placementId,
          studentId,
          action,
          closesAt: body?.closes_at ?? null,
          note: body?.note ?? null,
          actorId: (staff.caller as any).id ?? null,
        });

        if (action === 'open') {
          await notifyStudentAccessDecision({
            studentId,
            testId: (placement as any).test_id,
            placementId: params.placementId,
            testTitle,
            decision: 'granted',
            closesAt: row?.closes_at ?? null,
          });
        }
        results.push({ student_id: studentId, ok: true });
      } catch (err) {
        // One student failing must not cost the other thirty-nine their window.
        const reason = err instanceof Error ? err.message : 'Could not change access';
        console.error(`Bulk access ${action} failed for ${studentId}:`, reason);
        results.push({ student_id: studentId, ok: false, reason });
      }
    }

    const ok = results.filter((r) => r.ok).length;
    return NextResponse.json({
      data: {
        results,
        counts: {
          requested: requested.length,
          // Named rather than hidden: a teacher who selected the paper-wide view
          // and got half the grants deserves to know why.
          off_roster: requested.length - targets.length,
          ok,
          failed: results.length - ok,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to change access';
    console.error('Bulk test run access error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** The paper's name, for a message a student can act on. Never fatal. */
async function readTestTitle(testId: string | null | undefined, supabase: any): Promise<string | null> {
  if (!testId) return null;
  try {
    const { data } = await supabase.from('nexus_tests').select('title').eq('id', testId).maybeSingle();
    return (data as any)?.title ?? null;
  } catch {
    return null;
  }
}
