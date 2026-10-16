import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getRecapForStudent, upsertRecapProgress } from '@neram/database';
import { NOT_PREWATCH_KINDS, RESOURCE_COLS } from '@/lib/class-resources';
import { watchModeFor } from '@/lib/recap-obligation';

/**
 * GET /api/student/class-recaps/[recapId]
 * Student view of a published recap: checkpoints in order with passed/locked
 * flags (answers stripped). Ensures a progress row exists (marks in_progress).
 *
 * Also answers whether the checkpoints bind, as `watch_mode`. A student who owes
 * this class gets `gated` and meets every quiz. A student who sat in it, or has
 * already cleared it, gets `revision` and can move around the recording freely.
 *
 * That decision is made HERE, from the absence table, keyed on the user the
 * token identifies. It is not a query parameter and not a request body field,
 * so there is no form of the request a student can send that asks to be
 * ungated. Same discipline as `rearmCatchupTest`, which reads the student's
 * watch progress on the server rather than believing a client that says it
 * finished.
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
      .not('kind', 'in', NOT_PREWATCH_KINDS)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    // An ad-hoc recap has no class, so it has never been part of anyone's
    // backlog and there is no absence row to read. It stays gated: failing
    // closed leaves content that has always been quizzed exactly as it was.
    let obligation: { caught_up_at: string | null; excused_at: string | null } | null = null;
    // How much the trim took out, so the screen can say "53:51 instead of
    // 1:05:45". Only while the class is actually playing the trimmed copy.
    let trimRemovedSeconds: number | null = null;
    if (recap.scheduled_class_id) {
      const [{ data }, { data: cls }] = await Promise.all([
        supabase
          .from('nexus_class_absences')
          .select('caught_up_at, excused_at')
          .eq('scheduled_class_id', recap.scheduled_class_id)
          .eq('student_id', user.id)
          .maybeSingle(),
        supabase
          .from('nexus_scheduled_classes')
          .select('recording_trim_state, recording_trim_removed_seconds')
          .eq('id', recap.scheduled_class_id)
          .maybeSingle(),
      ]);
      obligation = data ?? null;
      if (cls?.recording_trim_state === 'applied') {
        trimRemovedSeconds = Number(cls.recording_trim_removed_seconds) || null;
      }
    }
    const watchMode = recap.scheduled_class_id ? watchModeFor(obligation) : 'gated';

    return NextResponse.json({
      recap,
      resources: resources || [],
      watch_mode: watchMode,
      trim_removed_seconds: trimRemovedSeconds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load recap';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
