import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getNexusSetting } from '@neram/database';

import { verifyMsToken } from '@/lib/ms-verify';
import { evaluateSubmission } from '@/lib/drawing-eval/evaluate';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';
import { evalTables } from '@/lib/drawing-eval/db';

/**
 * Ask for a draft evaluation of one drawing submission.
 *
 * Shadow stage: this writes a drawing_evaluation row and returns it, and
 * nothing it produces reaches a student. The review screen is untouched.
 *
 * Three independent gates have to be open before a call costs anything, and
 * they are deliberately not the same gate:
 *
 *   1. teacher or admin           who may ask
 *   2. staff.drawing-eval flag    whether the surface exists at all
 *   3. nexus.drawing-eval mode    whether a press may spend, enforced inside
 *                                 generateGemini by the shared budget guard
 *
 * The third ships 'off', so until someone turns it on in the admin panel this
 * route answers 409 with the prompt to paste into Gemini by hand, which is the
 * workflow teachers use today.
 */

export const maxDuration = 300;

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

    const outcome = await evaluateSubmission({
      supabase,
      submissionId,
      actorId: user.id as string,
    });

    if (!outcome.ok) {
      return NextResponse.json(
        {
          error: outcome.error,
          // Present when the budget guard refused. The caller shows it as a
          // copy-paste prompt rather than an error.
          manual_prompt: outcome.manualPrompt ?? null,
          evaluation_id: outcome.evaluationId ?? null,
        },
        { status: outcome.status },
      );
    }

    return NextResponse.json({
      evaluation_id: outcome.evaluationId,
      model: outcome.model,
      cost_usd: outcome.costUsd,
      result: outcome.result,
      notes: outcome.notes,
    });
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
