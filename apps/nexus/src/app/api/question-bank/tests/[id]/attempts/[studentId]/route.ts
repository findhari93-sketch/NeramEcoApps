import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import {
  getStudentTestAttemptReview,
  getSupabaseAdminClient,
  getPlacementById,
} from '@neram/database';

/**
 * GET /api/question-bank/tests/[id]/attempts/[studentId]?placement_id=<uuid>   (staff)
 *
 * One student's every sitting of one paper, each replayed into a full
 * per-question response sheet.
 *
 * This is the drill-down the results tab never had: it could say "7 attempts"
 * but not what any of them contained, so a teacher could see that a student
 * struggled without ever seeing what they actually got wrong.
 *
 * Scoped to a run when placement_id is given, so the sheet for a class test
 * does not also show the practice runs the student did in their own time.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; studentId: string } },
) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can see a student response sheet' }, { status: 403 });
    }

    const supabase = getSupabaseAdminClient();
    const placementId = request.nextUrl.searchParams.get('placement_id');

    // The run's own bar, not the paper's. The same paper can be set at two
    // different pass marks, and an attempt should be judged by the one that
    // was actually in force where it was sat.
    let passingPct: number | null = null;
    if (placementId) {
      const placement = await getPlacementById(placementId, supabase);
      if (!placement || (placement as any).test_id !== params.id) {
        return NextResponse.json({ error: 'That run is not on this paper' }, { status: 404 });
      }
      passingPct = (placement as any).passing_pct ?? null;
    }

    const [review, { data: student }] = await Promise.all([
      getStudentTestAttemptReview(
        { testId: params.id, studentId: params.studentId, placementId, passingPct },
        supabase,
      ),
      supabase.from('users').select('id, name, avatar_url').eq('id', params.studentId).maybeSingle(),
    ]);

    return NextResponse.json(
      {
        data: {
          test: review.test,
          attempts: review.attempts,
          student: student
            ? { id: (student as any).id, name: (student as any).name, avatar_url: (student as any).avatar_url }
            : null,
        },
      },
      { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load attempts';
    console.error('Student attempt review error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
