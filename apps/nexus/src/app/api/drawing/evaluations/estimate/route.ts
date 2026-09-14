import { NextRequest, NextResponse } from 'next/server';
import { getNexusSetting, getSupabaseAdminClient } from '@neram/database';
import { checkBudget } from '@neram/ai';

import { errorResponse } from '@/lib/api-errors';
import { verifyMsToken } from '@/lib/ms-verify';
import { estimateEvaluationCost } from '@/lib/drawing-eval/cost';
import { resolveDraftPlan } from '@/lib/drawing-eval/brief-context';
import { DRAWING_EVAL_FEATURE } from '@/lib/drawing-eval/evaluate';
import { evalTables } from '@/lib/drawing-eval/db';
import { isStaleClaim } from '@/lib/drawing-eval/claim-state';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';

/**
 * What a draft of this drawing would cost, whether one is allowed, and where
 * the automatic draft for it stands.
 *
 * Calls the SAME guards the real request uses (the staff.drawing-eval flag and
 * the shared AI budget), so a button can be greyed out with the real reason
 * rather than the caller guessing. Spends nothing: no model is contacted and no
 * image is downloaded, anchors are only counted.
 *
 * GET ?submission_id=
 * {
 *   allowed:        flag on AND budget allows a call
 *   ready:          the rubric criteria resolve, so a draft can be written
 *   mode:           'anchored' | 'generic'
 *   flagEnabled:    staff.drawing-eval
 *   claim:          newest AI row: 'running' | 'draft' | 'needs_manual' | null
 *                   (a running row older than ten minutes is a dead run: null)
 *   reason, message: why not allowed ('flag_off' or the budget reason), else the budget's own
 *   model, tokensIn, tokensOut, costUsd, costInr, seconds: the estimate
 *   anchor_count, criterion_count
 * }
 */
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

    // Read through a loose handle: exam_qb_question_id (which decides the brief
    // for an exam drawing) is not in database.generated.ts yet. And `*` rather
    // than naming it, because staging does not have the column, and a named
    // missing column returns no row, which read as "Submission not found".
    const loose = supabase as any;
    const { data: submission, error: submissionError } = await loose
      .from('drawing_submissions')
      .select('*')
      .eq('id', submissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const [setting, verdict, plan, newest] = await Promise.all([
      getNexusSetting(FEATURE_FLAGS_KEY),
      // No second argument: that slot is a per-visitor key for the public
      // chatbots, and this caller is an authenticated teacher.
      checkBudget(DRAWING_EVAL_FEATURE),
      resolveDraftPlan(supabase, submission),
      loose
        .from('drawing_evaluation')
        .select('status, created_at')
        .eq('submission_id', submissionId)
        .eq('source', 'ai')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then((r: { data: { status: string; created_at: string } | null }) => r.data),
    ]);

    const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
    const flagEnabled = isFeatureEnabled('staff.drawing-eval', flags);

    const briefTypeId = plan.briefType?.id ?? null;
    const { count: anchorCount } = briefTypeId
      ? await db
          .from('drawing_anchor_sheet')
          .select('id', { count: 'exact', head: true })
          .eq('brief_type_id', briefTypeId)
          .eq('is_active', true)
      : { count: 0 };

    let claim: 'running' | 'draft' | 'needs_manual' | null = null;
    if (newest?.status === 'running') {
      claim = isStaleClaim(newest.created_at, new Date()) ? null : 'running';
    } else if (newest?.status === 'draft' || newest?.status === 'needs_manual') {
      claim = newest.status;
    }

    const estimate = estimateEvaluationCost({
      anchorCount: plan.mode === 'anchored' ? plan.anchorRows.length : 0,
      criterionCount: plan.criteria.length,
      usdToInr: verdict.controls.usdToInr,
    });

    return NextResponse.json({
      ...estimate,
      allowed: flagEnabled && verdict.allowed,
      ready: plan.criteria.length > 0,
      mode: plan.mode,
      flagEnabled,
      claim,
      reason: flagEnabled ? verdict.reason : 'flag_off',
      message: flagEnabled ? verdict.message : 'AI drawing evaluation is switched off.',
      anchor_count: anchorCount ?? 0,
      criterion_count: plan.criteria.length,
    });
  } catch (err) {
    return errorResponse(err, 'Could not estimate this draft');
  }
}
