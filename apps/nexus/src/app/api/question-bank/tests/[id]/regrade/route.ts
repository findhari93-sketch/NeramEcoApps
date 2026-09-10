import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { errorResponse } from '@/lib/api-errors';
import { getSupabaseAdminClient, regradeTestAttempts } from '@neram/database';

/**
 * POST /api/question-bank/tests/[id]/regrade            (staff)
 * Body: { placement_id?: string | null, dry_run: boolean, reason?: string }
 *
 * Re-mark every already-submitted attempt against the questions as they stand
 * now. Offered after an answer key is corrected, because correcting a key fixes
 * the future on its own and leaves the past wrong: getComposedTestQuestions
 * reads correct_answer live at grading time, while a submitted attempt keeps the
 * score written at submit time.
 *
 * dry_run is not a courtesy, it is the contract. It runs exactly the same code
 * over exactly the same rows and writes nothing, so the preview a teacher
 * approves cannot disagree with what pressing Apply does.
 *
 * Deliberately NOT a GET for the preview. It is expensive (every attempt
 * re-graded), and a GET invites a cache or a prefetch to run it.
 */

interface Ctx {
  params: { id: string };
}

// Re-grading a run with forty sitters replays forty papers. The default 15s
// budget is not enough on a long paper, and a timeout here would leave scores
// half written with no log of which ones moved.
export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await verifyQBStaff(request.headers.get('Authorization'));
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}) as any);
    const placementId =
      typeof body?.placement_id === 'string' && body.placement_id ? body.placement_id : null;
    // Defaults to a preview. A missing or malformed flag must never be read as
    // "go ahead and rewrite everybody's score".
    const dryRun = body?.dry_run !== false;
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 300) : null;

    const supabase = getSupabaseAdminClient() as any;

    if (placementId) {
      // The run has to be on this paper, or a teacher who could reach one test
      // could re-grade a run belonging to another.
      const { data: placement } = await supabase
        .from('nexus_test_placements')
        .select('id, test_id')
        .eq('id', placementId)
        .maybeSingle();
      if (!placement || placement.test_id !== params.id) {
        return NextResponse.json({ error: 'That run is not on this paper.' }, { status: 404 });
      }
    }

    const result = await regradeTestAttempts(
      {
        testId: params.id,
        placementId,
        dryRun,
        actorId: auth.caller.id,
        reason: reason || (dryRun ? null : 'Answer key corrected from the results screen'),
      },
      supabase,
    );

    return NextResponse.json({ data: result });
  } catch (err) {
    return errorResponse(err, 'Could not re-grade those attempts');
  }
}
