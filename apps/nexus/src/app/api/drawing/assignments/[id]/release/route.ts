/**
 * Hand back an assignment's held drawing reviews.
 *
 * GET is the preflight: what is held, what would block the hand-back, what is
 * worth a warning. Blockers disable the button and warnings do not, the same
 * line the exam publish flow draws, because a batch of Teams cards cannot be
 * recalled.
 *
 * POST writes the release and announces nothing. Students are told by the
 * separate notify pass. See lib/drawing-release-server.ts for why the two are
 * split and why the order matters.
 *
 * Rolling, not terminal: late joiners keep submitting for weeks, so this can be
 * called again next week for whoever is held by then. Handing back to one
 * student is kind 'single' with one id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { buildReleasePreflight, releaseSummary } from '@/lib/drawing-release-model';
import { daysSince, loadHeld, releaseHeld } from '@/lib/drawing-release-server';

async function requireStaff(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .maybeSingle();
  if (!user || !['teacher', 'admin'].includes(user.user_type as string)) return null;
  return { supabase, user };
}

const isNotMigrated = (message: string) => /does not exist|schema cache/i.test(message);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;

    const { data: assignment } = await auth.supabase
      .from('nexus_class_assignments')
      .select('id, title, review_release_mode')
      .eq('id', id)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    const held = await loadHeld(auth.supabase, id);

    let withoutTeamsEmail = 0;
    if (held.length) {
      const { data: students } = await auth.supabase
        .from('users')
        .select('id, ms_teams_email')
        .in('id', [...new Set(held.map((h) => h.studentId))]);
      withoutTeamsEmail = ((students ?? []) as Array<{ ms_teams_email?: string | null }>)
        .filter((s) => !s.ms_teams_email).length;
    }

    const oldest = held.reduce<string | null>((min, h) => {
      if (!h.reviewedAt) return min;
      return !min || h.reviewedAt < min ? h.reviewedAt : min;
    }, null);

    const preflight = buildReleasePreflight({
      held: held.length,
      // Zero by construction while every held review is a teacher's own: a
      // person opened each one to write it. These count once AI drafts can be
      // held unread, and they block the button then.
      flagged: 0,
      unopened: 0,
      withoutTeamsEmail,
      oldestHeldDays: daysSince(oldest),
    });

    return NextResponse.json({
      assignment: { id: assignment.id, title: assignment.title, mode: assignment.review_release_mode },
      held: held.map((h) => ({ submission_id: h.submissionId, student_id: h.studentId, intent: h.intent })),
      counts: {
        held: held.length,
        complete: held.filter((h) => h.intent === 'complete').length,
        redo: held.filter((h) => h.intent === 'redo').length,
      },
      summary: releaseSummary(held.length),
      ...preflight,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not prepare the hand-back';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Hold and release is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Switch an assignment between sending on Complete and holding for a hand-back.
 *
 * Switching back to 'immediate' does NOT release what is already held: those
 * reviews stay waiting until someone hands them back, so flipping a setting can
 * never fire a batch of Teams cards by accident.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { mode?: string };
    if (body.mode !== 'immediate' && body.mode !== 'held') {
      return NextResponse.json({ error: 'mode must be immediate or held' }, { status: 400 });
    }
    const { error } = await auth.supabase
      .from('nexus_class_assignments')
      .update({ review_release_mode: body.mode })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, mode: body.mode });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not change how reviews are handed back';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Hold and release is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as { kind?: string; submission_ids?: unknown };
    const kind = body.kind ?? 'all';
    if (!['all', 'selection', 'single'].includes(kind)) {
      return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
    }
    const ids = Array.isArray(body.submission_ids)
      ? body.submission_ids.filter((x): x is string => typeof x === 'string')
      : [];
    if (kind !== 'all' && ids.length === 0) {
      return NextResponse.json({ error: 'Say which drawings to hand back' }, { status: 400 });
    }
    if (kind === 'single' && ids.length !== 1) {
      return NextResponse.json({ error: 'A single hand-back takes exactly one drawing' }, { status: 400 });
    }

    // The same rule the preflight shows, enforced again here, because a hidden
    // button is never the boundary.
    const held = await loadHeld(auth.supabase, id);
    const inScope = kind === 'all' ? held.length : held.filter((h) => ids.includes(h.submissionId)).length;
    if (inScope === 0) {
      return NextResponse.json({ error: 'Nothing held matches, so nothing was handed back' }, { status: 409 });
    }

    const result = await releaseHeld({
      supabase: auth.supabase,
      assignmentId: id,
      userId: auth.user.id as string,
      kind: kind as 'all' | 'selection' | 'single',
      submissionIds: ids,
    });

    return NextResponse.json({ ok: true, batch_id: result.batchId, released: result.released });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not hand back the drawings';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Hold and release is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
