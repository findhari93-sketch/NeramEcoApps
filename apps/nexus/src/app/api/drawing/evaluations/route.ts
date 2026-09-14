import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getNexusSetting } from '@neram/database';

import { verifyMsToken } from '@/lib/ms-verify';
import { runAutoDraft, type AutoDraftState } from '@/lib/drawing-auto-draft';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';
import { evalTables } from '@/lib/drawing-eval/db';

/**
 * "Draft again": replace the AI draft of one drawing submission.
 *
 * Drafts now arrive on their own (lib/drawing-auto-draft.ts). This is the
 * teacher's button for a draft that came back wrong or failed: the current
 * draft is marked superseded and a fresh one is run through the same claim,
 * orientation, evaluation and tagging path.
 *
 * Three independent gates have to be open before a call costs anything, and
 * they are deliberately not the same gate:
 *
 *   1. teacher or admin           who may ask
 *   2. staff.drawing-eval flag    whether the surface exists at all
 *   3. nexus.drawing-eval mode    whether a press may spend, enforced by the
 *                                 shared budget guard
 *
 * Body: { submission_id }. Answers the runAutoDraft result,
 * { state, reason?, rotatedDeg?, tags?, evaluationId?, mode? }, plus `error`
 * when nothing was drafted. Status 200 for drafted, busy and skipped; 409 when
 * blocked; 422 when the draft failed, so a caller that only checks res.ok still
 * shows the reason.
 */

export const maxDuration = 300;

const STATUS_FOR: Record<AutoDraftState, number> = {
  drafted: 200,
  busy: 200,
  skipped: 200,
  blocked: 409,
  failed: 422,
};

const ERROR_FOR: Partial<Record<AutoDraftState, string>> = {
  busy: 'A draft of this drawing is already being written.',
  skipped: 'This drawing is not waiting for review, so it was not drafted.',
  blocked: 'AI drafting is switched off or over its budget right now.',
  failed: 'The draft did not come back.',
};

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const setting = await getNexusSetting(FEATURE_FLAGS_KEY);
    const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
    if (!isFeatureEnabled('staff.drawing-eval', flags)) {
      return NextResponse.json({ error: 'AI drawing evaluation is switched off.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const submissionId = typeof body?.submission_id === 'string' ? body.submission_id : '';
    if (!submissionId) {
      return NextResponse.json({ error: 'submission_id is required' }, { status: 400 });
    }

    const result = await runAutoDraft(supabase, submissionId, { actorId: user.id as string, force: true });

    if (result.state === 'drafted') return NextResponse.json(result);
    const error =
      result.state === 'failed' && result.reason ? result.reason : ERROR_FOR[result.state] ?? 'The draft did not come back.';
    return NextResponse.json({ ...result, error }, { status: STATUS_FOR[result.state] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    if (message.includes('token') || message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[drawing/evaluations] failed:', message);
    return NextResponse.json({ error: 'Could not evaluate this submission' }, { status: 500 });
  }
}

/** Recent evaluations for one submission, newest first. */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    const db = evalTables(supabase);

    const submissionId = request.nextUrl.searchParams.get('submission_id');
    if (!submissionId) {
      return NextResponse.json({ error: 'submission_id is required' }, { status: 400 });
    }

    const { data: evaluations } = await db
      .from('drawing_evaluation')
      .select('id, status, model_id, prompt_version, ai_total, final_total, overall_comment, error, created_at')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false })
      .limit(10);

    const rows = (evaluations || []) as Array<{ id: string }>;
    if (rows.length === 0) return NextResponse.json({ evaluations: [] });

    const ids = rows.map((r) => r.id);
    const [{ data: criteria }, { data: annotations }] = await Promise.all([
      db.from('drawing_evaluation_criterion').select('*').in('evaluation_id', ids),
      db.from('drawing_annotation').select('*').in('evaluation_id', ids),
    ]);

    return NextResponse.json({
      evaluations: rows.map((row) => ({
        ...row,
        criteria: (criteria || []).filter((c: any) => c.evaluation_id === row.id),
        annotations: (annotations || []).filter((a: any) => a.evaluation_id === row.id),
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
