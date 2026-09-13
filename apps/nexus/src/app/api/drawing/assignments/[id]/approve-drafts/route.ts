/**
 * Approve AI drafts without opening them, then hold them for a hand-back.
 *
 * POST { submission_ids? }
 *
 * The one path that lets a grade nobody read reach a student, so it is shut
 * three ways:
 *
 *  1. The shadow gate. Refused, with the reason, until enough sheets have been
 *     graded by a teacher beside a draft and the draft landed within one band
 *     on every criterion. See unreadDraftsGate in lib/drawing-ai-draft.ts.
 *  2. Only LOOKS ROUTINE sheets, and only drafts sure of EVERY criterion. An
 *     unsure score is skipped and counted: a person decides those.
 *  3. Nothing is sent. Approved drafts are HELD, so they wait in Hand back
 *     with the preflight and the student card preview like any other review.
 *
 * Approved-unread reviews are marked train_from_this = false, so the model is
 * never graded against its own unread output.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';
import { loadAiDraft, loadScorePairs } from '@/lib/drawing-ai-draft-server';
import { isConfident, shadowAgreement, unreadDraftsGate } from '@/lib/drawing-ai-draft';
import { loadAssignmentTriage } from '@/lib/drawing-triage-server';
import { ensureManualEvaluation } from '@/lib/drawing-reference-server';
import { briefKeyForSubmission } from '@/lib/drawing-brief-resolve';
import { criteriaForBrief, overallFromBands, overallToStars, type Band, type BandMap } from '@/lib/drawing-rubric';
import { holdReview } from '@/lib/drawing-hold';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const supabase = auth.supabase;

    const gate = unreadDraftsGate(shadowAgreement(await loadScorePairs(supabase)));
    if (!gate.ready) return NextResponse.json({ error: gate.reason, gate }, { status: 409 });

    const body = (await request.json().catch(() => ({}))) as { submission_ids?: unknown };
    const only = Array.isArray(body.submission_ids)
      ? new Set(body.submission_ids.filter((x): x is string => typeof x === 'string'))
      : null;

    const triage = await loadAssignmentTriage(supabase, id);
    const candidates = triage.items.filter((t) => t.band === 'routine' && t.has_ai_draft && (!only || only.has(t.submission_id)));

    let held = 0;
    let skippedUnsure = 0;
    for (const item of candidates) {
      const draft = await loadAiDraft(supabase, item.submission_id);
      if (!draft) continue;

      const { data: submission } = await supabase
        .from('drawing_submissions')
        .select('id, question_id, assignment_id, tutor_feedback')
        .eq('id', item.submission_id)
        .maybeSingle();
      if (!submission) continue;
      const criteria = criteriaForBrief(await briefKeyForSubmission(supabase, submission));

      const unsure = criteria.some((c) => !draft.criteria[c.key] || !isConfident(draft.criteria[c.key].confidence));
      if (unsure) { skippedUnsure += 1; continue; }

      const bands: BandMap = Object.fromEntries(criteria.map((c) => [c.key, draft.criteria[c.key].ai_band as Band]));
      const evaluationId = await ensureManualEvaluation(supabase, item.submission_id, auth.user.id);
      const { error: rowsError } = await supabase.from('drawing_evaluation_criterion').upsert(
        criteria.map((c) => ({
          evaluation_id: evaluationId,
          criterion_key: c.key,
          ai_band: bands[c.key],
          final_band: bands[c.key],
          was_corrected: false,
        })),
        { onConflict: 'evaluation_id,criterion_key' },
      );
      if (rowsError) throw new Error(rowsError.message);

      await holdReview({
        supabase,
        submissionId: item.submission_id,
        userId: auth.user.id,
        intent: 'complete',
        fields: {
          tutor_rating: overallToStars(overallFromBands(bands, criteria)),
          tutor_feedback: submission.tutor_feedback?.trim() ? submission.tutor_feedback : draft.overall_comment,
        },
      });

      const { error: markError } = await supabase
        .from('drawing_evaluation')
        .update({ train_from_this: false })
        .eq('id', evaluationId);
      if (markError) throw new Error(markError.message);
      held += 1;
    }

    return NextResponse.json({ ok: true, held, skipped_unsure: skippedUnsure });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not approve the drafts';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Drawing evaluation is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
