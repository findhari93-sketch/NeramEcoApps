import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getRecapForStudent, upsertRecapProgress } from '@neram/database';
import { RESOURCE_COLS } from '@/lib/class-resources';

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
    // Foundation chapter tracks share this table but are reached through
    // /api/student/study-videos, which authorises by study-folder audience
    // rather than by classroom enrollment.
    if (recap.study_file_id) {
      return NextResponse.json({ error: 'Recap not found' }, { status: 404 });
    }
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

    // The teacher's reference material for the class this recap covers, so a
    // student who fails a checkpoint has something to revise from without
    // leaving the page. An extra query inside this same invocation rather than a
    // second request from the browser, and rather than widening the shared
    // getRecapForStudent query that four other callers depend on.
    const { data: resources } = await supabase
      .from('nexus_class_resources')
      .select(RESOURCE_COLS)
      .eq('scheduled_class_id', recap.scheduled_class_id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    return NextResponse.json({ recap, resources: resources || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load recap';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
