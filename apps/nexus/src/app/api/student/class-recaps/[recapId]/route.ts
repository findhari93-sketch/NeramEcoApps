import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getRecapForStudent, upsertRecapProgress } from '@neram/database';

/**
 * GET /api/student/class-recaps/[recapId]
 * Student view of a published recap: checkpoints in order with passed/locked
 * flags (answers stripped). Ensures a progress row exists (marks in_progress).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { recapId } = await params;
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const recap = await getRecapForStudent(recapId, user.id);
    if (!recap) return NextResponse.json({ error: 'Recap not found' }, { status: 404 });
    if (recap.status !== 'published') {
      return NextResponse.json({ error: 'This recap is not available yet' }, { status: 403 });
    }

    // First open → start tracking (do not clobber a completed status).
    if (recap.progress_status == null) {
      await upsertRecapProgress(user.id, recapId, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ recap });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load recap';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
