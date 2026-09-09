import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { checkBudget } from '@neram/ai';

import { verifyMsToken } from '@/lib/ms-verify';
import { estimateEvaluationCost } from '@/lib/drawing-eval/cost';
import { resolveBriefType } from '@/lib/drawing-eval/brief-context';
import { DRAWING_EVAL_FEATURE } from '@/lib/drawing-eval/evaluate';
import { evalTables } from '@/lib/drawing-eval/db';

/**
 * What this evaluation would cost, and whether it is currently allowed.
 *
 * Calls the SAME guard the real request uses, so the button can be greyed out
 * with the real reason rather than the caller guessing. Spends nothing: no
 * model is contacted, and the anchors are not fetched, only counted.
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

    // exam_qb_question_id is real in the database (added by the exam drawings
    // migration) but is not in database.generated.ts yet, so the generated
    // client rejects the select. Read through a loose handle rather than drop
    // the column, which would quietly change which brief type resolves.
    const { data: submission } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: string) => {
            maybeSingle: () => Promise<{
              data: {
                id: string;
                question_id: string | null;
                assignment_id: string | null;
                exam_qb_question_id: string | null;
              } | null;
            }>;
          };
        };
      };
    })
      .from('drawing_submissions')
      .select('id, question_id, assignment_id, exam_qb_question_id')
      .eq('id', submissionId)
      .maybeSingle();

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // No second argument: that slot is a per-visitor key for the public
    // chatbots, and this caller is an authenticated teacher.
    const verdict = await checkBudget(DRAWING_EVAL_FEATURE);

    // Count the setup without downloading any images: buildContext fetches
    // anchor bytes, which would make a price quote cost real bandwidth on
    // every keystroke. Counting rows is enough for an estimate.
    const { briefType } = await resolveBriefType(supabase, submission);
    const briefTypeId = briefType?.id ?? null;
    const [{ count: anchorCount }, { count: criterionCount }] = await Promise.all([
      db
        .from('drawing_anchor_sheet')
        .select('id', { count: 'exact', head: true })
        .eq('brief_type_id', briefTypeId ?? '00000000-0000-0000-0000-000000000000')
        .eq('is_active', true),
      db
        .from('drawing_criterion')
        .select('id', { count: 'exact', head: true })
        .eq('brief_type_id', briefTypeId ?? '00000000-0000-0000-0000-000000000000'),
    ]);

    const estimate = estimateEvaluationCost({
      anchorCount: anchorCount ?? 0,
      criterionCount: criterionCount ?? 0,
      usdToInr: verdict.controls.usdToInr,
    });

    return NextResponse.json({
      ...estimate,
      allowed: verdict.allowed,
      reason: verdict.reason,
      message: verdict.message,
      anchor_count: anchorCount ?? 0,
      criterion_count: criterionCount ?? 0,
      ready: (anchorCount ?? 0) === 5 && (criterionCount ?? 0) > 0,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
