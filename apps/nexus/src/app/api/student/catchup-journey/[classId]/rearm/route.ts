import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, rearmCatchupTest } from '@neram/database';

/**
 * POST /api/student/catchup-journey/[classId]/rearm
 *
 * Re-open the class test after a failed attempt, once the student has actually
 * been back through the recording.
 *
 * There is no request body worth trusting here, so there is none. The check
 * reads how far through the recording the student got from
 * nexus_class_recap_progress, which the player already heartbeats. Recap
 * completion on its own cannot be the gate: markRecapCompletedIfAllPassed stays
 * true forever once the checkpoints are passed, so it cannot tell a genuine
 * rewatch from a page refresh.
 */
export async function POST(request: NextRequest, { params }: { params: { classId: string } }) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const outcome = await rearmCatchupTest(user.id, params.classId, supabase);

    if (outcome.ok) {
      return NextResponse.json({
        ok: true,
        already_passed: !!outcome.alreadyPassed,
        rewatch_count: outcome.rewatchCount ?? null,
      });
    }

    const messages: Record<string, { message: string; status: number }> = {
      no_item: { message: 'This class is not on your catch-up list.', status: 404 },
      no_recap: { message: 'There is no guided recap for this class yet.', status: 404 },
      not_rewatched: {
        message: 'Watch the class through to the end to unlock the test again.',
        status: 400,
      },
    };
    const mapped = messages[outcome.reason];
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to unlock the test';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
