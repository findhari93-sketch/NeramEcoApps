/**
 * Reading AI drafts out of the evaluation tables.
 *
 * evaluate.ts writes a draft as a `source = 'ai'` evaluation with per-criterion
 * `ai_band` and `confidence`, and region annotations tagged with the criterion
 * they belong to. This reads that shape back for the review screen, the triage
 * list and the shadow comparison. It never writes a draft and never asks for
 * one.
 */

import type { AiDraft, AiDraftCriterion, Confidence, ScorePair } from './drawing-ai-draft';

/**
 * Statuses an AI evaluation can hold while still being a draft worth showing.
 *
 * Deliberately an allow list. 'running' is a claim with no scores yet,
 * 'superseded' is a draft someone replaced, and 'needs_manual' is a failure:
 * none of them may ever reach the review screen as a draft.
 */
export const DRAFT_STATUSES = ['draft', 'reviewed'];

/** The tags a draft chose, as stored beside the model's answer. */
export function draftTagsFrom(rawResponse: unknown): string[] {
  const tags = (rawResponse as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
}

export async function loadAiDraft(supabase: any, submissionId: string): Promise<AiDraft | null> {
  try {
    const { data: evaluation } = await supabase
      .from('drawing_evaluation')
      .select('id, created_at, overall_comment, status, raw_response')
      .eq('submission_id', submissionId)
      .eq('source', 'ai')
      .in('status', DRAFT_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!evaluation?.id || !DRAFT_STATUSES.includes(evaluation.status)) return null;

    const [{ data: rows }, { data: marks }] = await Promise.all([
      supabase
        .from('drawing_evaluation_criterion')
        .select('criterion_key, ai_band, confidence, reasoning')
        .eq('evaluation_id', evaluation.id),
      supabase
        .from('drawing_annotation')
        .select('id, criterion_key, kind, geometry, marker, comment')
        .eq('evaluation_id', evaluation.id)
        .eq('source', 'ai')
        .eq('kind', 'region'),
    ]);

    const criteria: Record<string, AiDraftCriterion> = {};
    for (const r of (rows ?? []) as Array<{ criterion_key: string; ai_band: number | null; confidence: Confidence | null; reasoning: string | null }>) {
      if (r.ai_band) criteria[r.criterion_key] = { ai_band: r.ai_band, confidence: r.confidence, reasoning: r.reasoning };
    }

    const draftMarks = ((marks ?? []) as Array<{ id: string; criterion_key: string | null; geometry: unknown; marker: string | null; comment: string | null }>)
      .map((m) => {
        const g = m.geometry as number[];
        if (!Array.isArray(g) || g.length !== 4 || !g.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
        const confidence = m.criterion_key ? criteria[m.criterion_key]?.confidence : null;
        return {
          id: m.id,
          criterion_key: m.criterion_key,
          x: g[0], y: g[1], width: g[2], height: g[3],
          marker: m.marker,
          comment: m.comment,
          confident: confidence === 'high',
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    return {
      evaluation_id: evaluation.id,
      created_at: evaluation.created_at,
      overall_comment: evaluation.overall_comment ?? null,
      criteria,
      marks: draftMarks,
      tags: draftTagsFrom(evaluation.raw_response),
    };
  } catch {
    return null;
  }
}

/** The AI band per criterion for one drawing, or an empty map. */
export async function aiBandsFor(supabase: any, submissionId: string): Promise<Record<string, number>> {
  const draft = await loadAiDraft(supabase, submissionId);
  return Object.fromEntries(Object.entries(draft?.criteria ?? {}).map(([k, c]) => [k, c.ai_band]));
}

/** Submission ids, out of the ones given, that carry an AI draft. */
export async function submissionsWithDrafts(supabase: any, submissionIds: string[]): Promise<Set<string>> {
  if (submissionIds.length === 0) return new Set();
  try {
    const { data } = await supabase
      .from('drawing_evaluation')
      .select('submission_id')
      .in('submission_id', submissionIds)
      .eq('source', 'ai')
      .in('status', DRAFT_STATUSES);
    return new Set(((data ?? []) as Array<{ submission_id: string }>).map((r) => r.submission_id));
  } catch {
    return new Set();
  }
}

/**
 * Every criterion a teacher scored beside a draft: the manual row carries a
 * copy of the draft's band, so the pair is one read.
 */
export async function loadScorePairs(supabase: any): Promise<ScorePair[]> {
  const { data: rows, error } = await supabase
    .from('drawing_evaluation_criterion')
    .select('evaluation_id, criterion_key, ai_band, final_band')
    .not('ai_band', 'is', null)
    .not('final_band', 'is', null)
    .limit(10000);
  if (error) throw new Error(error.message);
  const list = (rows ?? []) as Array<{ evaluation_id: string; criterion_key: string; ai_band: number; final_band: number }>;
  if (list.length === 0) return [];

  const evalIds = Array.from(new Set(list.map((r) => r.evaluation_id)));
  const { data: evals, error: evalError } = await supabase
    .from('drawing_evaluation')
    .select('id, submission_id, intent, train_from_this')
    .in('id', evalIds)
    .eq('source', 'manual');
  if (evalError) throw new Error(evalError.message);
  const manualRows = (evals ?? []) as Array<{ id: string; submission_id: string; intent: string | null; train_from_this: boolean | null }>;

  // Only a teacher's own, finished review counts:
  //  - an untouched AI row carries final_band equal to ai_band by construction;
  //  - a prefilled review nobody finished is not agreement, just a default;
  //  - drafts approved unread (train_from_this = false) would grade the model
  //    against itself.
  const { data: subs } = await supabase
    .from('drawing_submissions')
    .select('id, status')
    .in('id', Array.from(new Set(manualRows.map((e) => e.submission_id))));
  const finished = new Set(((subs ?? []) as Array<{ id: string; status: string }>)
    .filter((s) => ['completed', 'redo', 'reviewed'].includes(s.status))
    .map((s) => s.id));
  const manual = new Map(
    manualRows
      .filter((e) => e.train_from_this !== false && (e.intent || finished.has(e.submission_id)))
      .map((e) => [e.id, e.submission_id]),
  );

  return list
    .filter((r) => manual.has(r.evaluation_id))
    .map((r) => ({ submission_id: manual.get(r.evaluation_id)!, criterion_key: r.criterion_key, ai_band: r.ai_band, final_band: r.final_band }));
}
