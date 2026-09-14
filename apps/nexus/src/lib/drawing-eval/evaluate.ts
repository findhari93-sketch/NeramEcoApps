/**
 * Run one evaluation: build the request, call the model, validate, persist.
 *
 * There is no provider abstraction here on purpose. @neram/ai already is one:
 * callers name a feature, not a model, the tier decides the cascade, and
 * direct Gemini calls are ESLint-banned in every app. A second interface on
 * top of that would be a layer that only ever has one implementation.
 *
 * The one rule that must not be relaxed: a response that does not validate is
 * never written as a partial record. It becomes needs_manual, with the raw
 * bytes kept for diagnosis, because a half-parsed evaluation is worse than
 * none. A teacher can tell "the model could not do this one" from a blank
 * screen; they cannot tell a silently truncated draft from a complete one.
 *
 * Automatic drafting (lib/drawing-auto-draft.ts) claims the sheet first by
 * inserting a 'running' row, and passes that row's id in. The draft or the
 * failure is then written ONTO the claim, never beside it, so the unique
 * "one live AI draft per sheet" index is what stops two runs paying twice.
 */

import { AiBlockedError, generateGemini } from '@neram/ai';

import { buildContext, fetchImagePart } from './brief-context';
import { buildEvaluationParts, buildSystemInstruction } from './prompt';
import {
  buildEvaluationSchema,
  parseEvaluation,
  promptVersionFor,
  type EvalMode,
  type EvaluationResult,
} from './schema';

export const DRAWING_EVAL_FEATURE = 'nexus.drawing-eval' as const;

/** Beyond this the model is padding, and a truncated answer still bills in full. */
const MAX_OUTPUT_TOKENS = 4096;

/** Low, because we want the same sheet to place the same way twice. */
const TEMPERATURE = 0.2;

export interface EvaluateArgs {
  supabase: any;
  submissionId: string;
  /** users.id of whoever caused the run, for usage attribution. Null for a sweep nobody pressed. */
  actorId: string | null;
  /**
   * A 'running' drawing_evaluation row already claimed for this run. When
   * given, the result updates that row instead of inserting a new one.
   */
  claimedEvaluationId?: string | null;
  /** Tag labels the model may choose from. Empty means no tags are asked for. */
  tagLabels?: readonly string[];
  /** Merged into raw_response beside the model text, for example the orientation check. */
  extraRaw?: Record<string, unknown>;
}

/**
 * Why a run did not produce a draft, so a caller can act without parsing text.
 *  - blocked:      the AI controls refused (switched off, over budget). Nothing spent.
 *  - rate_limited: Gemini answered 429. Nothing written.
 *  - not_found:    the submission is gone.
 *  - image:        the student sheet could not be downloaded. Recorded as needs_manual.
 *  - model:        the model failed or answered unusably twice. Recorded as needs_manual.
 */
export type EvaluateFailureKind = 'blocked' | 'rate_limited' | 'not_found' | 'image' | 'model';

export type EvaluateOutcome =
  | {
      ok: true;
      evaluationId: string;
      result: EvaluationResult;
      model: string;
      costUsd: number | null;
      notes: string[];
      mode: EvalMode;
    }
  | {
      ok: false;
      status: number;
      error: string;
      kind: EvaluateFailureKind;
      manualPrompt?: string | null;
      blockedReason?: string;
      evaluationId?: string;
    };

interface SubmissionRow {
  id: string;
  original_image_url: string;
  question_id: string | null;
  assignment_id: string | null;
  exam_qb_question_id: string | null;
}

/**
 * Record a run that never produced a usable draft.
 *
 * Written even for failures so that a brief type whose sheets consistently
 * defeat the model is visible in the data rather than only in someone's memory.
 * With a claim, the claim itself becomes the failure record.
 */
async function recordFailure(
  supabase: any,
  args: {
    submissionId: string;
    briefTypeId: string | null;
    actorId: string | null;
    error: string;
    mode: EvalMode;
    claimedEvaluationId?: string | null;
    modelId?: string | null;
    raw?: unknown;
  },
): Promise<string | undefined> {
  const row = {
    brief_type_id: args.briefTypeId,
    status: 'needs_manual',
    prompt_version: promptVersionFor(args.mode),
    model_id: args.modelId ?? null,
    raw_response: args.raw ?? null,
    error: args.error,
  };

  if (args.claimedEvaluationId) {
    await supabase
      .from('drawing_evaluation')
      .update(row)
      .eq('id', args.claimedEvaluationId)
      .eq('status', 'running');
    return args.claimedEvaluationId;
  }

  const { data } = await supabase
    .from('drawing_evaluation')
    .insert({ ...row, submission_id: args.submissionId, source: 'ai', created_by: args.actorId })
    .select('id')
    .single();
  return data?.id as string | undefined;
}

export async function evaluateSubmission(args: EvaluateArgs): Promise<EvaluateOutcome> {
  const { supabase, submissionId, actorId } = args;
  const claimedEvaluationId = args.claimedEvaluationId ?? null;
  const tagLabels = args.tagLabels ?? [];

  // `*`, not a column list: exam_qb_question_id exists on production but not on
  // staging, and naming a missing column makes PostgREST answer with no row at
  // all, which read here as "Submission not found" for every sheet.
  const { data: submission, error: submissionError } = await supabase
    .from('drawing_submissions')
    .select('*')
    .eq('id', submissionId)
    .maybeSingle();

  if (submissionError) {
    return { ok: false, status: 500, kind: 'model', error: `Could not load the submission: ${submissionError.message}` };
  }
  if (!submission) {
    return { ok: false, status: 404, kind: 'not_found', error: 'Submission not found.' };
  }
  const sub = submission as SubmissionRow;

  const context = await buildContext(supabase, sub);
  const { mode, briefType, criteria, anchors, questionText } = context;
  const briefTypeId = briefType?.id ?? null;

  const student = await fetchImagePart(sub.original_image_url);
  if (!student) {
    const error = 'The student sheet could not be loaded, so there was nothing to evaluate.';
    const evaluationId = await recordFailure(supabase, {
      submissionId,
      briefTypeId,
      actorId,
      error,
      mode,
      claimedEvaluationId,
    });
    return { ok: false, status: 422, kind: 'image', error, evaluationId };
  }

  const parts = buildEvaluationParts({
    mode,
    briefTitle: context.briefTitle,
    briefDescription: context.briefDescription,
    questionText,
    criteria,
    anchors,
    student,
    tagLabels,
  });

  const expectedKeys = criteria.map((c) => c.key);
  let lastRaw = '';
  let lastModel: string | null = null;
  const errors: string[] = [];

  // Two attempts, no more. A model that returns unusable JSON twice against a
  // constrained schema is not going to succeed on a third paid try.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await generateGemini({
        feature: DRAWING_EVAL_FEATURE,
        parts,
        systemInstruction: buildSystemInstruction(mode),
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        responseSchema: buildEvaluationSchema(tagLabels),
        actorId,
      });

      lastRaw = res.text;
      lastModel = res.model;

      if (res.finishReason === 'MAX_TOKENS') {
        // Truncated JSON never parses, and it already cost full price. Say so
        // rather than letting it read as a malformed-response mystery.
        errors.push('The model ran out of output space before finishing.');
        continue;
      }

      const parsed = parseEvaluation(res.text, expectedKeys, { mode, tagLabels });
      if (!parsed.ok) {
        errors.push(...parsed.errors);
        continue;
      }

      const evaluationId = await persist(supabase, {
        submissionId,
        briefTypeId,
        actorId,
        modelId: res.model,
        raw: res.text,
        result: parsed.value,
        mode,
        claimedEvaluationId,
        extraRaw: args.extraRaw,
      });

      return {
        ok: true,
        evaluationId,
        result: parsed.value,
        model: res.model,
        costUsd: res.costUsd,
        notes: parsed.notes,
        mode,
      };
    } catch (err) {
      if (err instanceof AiBlockedError) {
        // Expected, costs nothing, and for this feature carries the prompt the
        // teacher already pastes into Gemini by hand. Not a failure to record.
        return {
          ok: false,
          status: 409,
          kind: 'blocked',
          error: err.message,
          manualPrompt: err.manualPrompt,
          blockedReason: err.reason,
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      if (/429/.test(message)) {
        return {
          ok: false,
          status: 429,
          kind: 'rate_limited',
          error: 'Gemini is rate limited right now. Try again shortly.',
        };
      }
      errors.push(message);
      break;
    }
  }

  const error = errors.join(' ') || 'The model did not return a usable evaluation.';
  const evaluationId = await recordFailure(supabase, {
    submissionId,
    briefTypeId,
    actorId,
    error,
    mode,
    claimedEvaluationId,
    modelId: lastModel,
    raw: lastRaw ? { text: lastRaw, ...(args.extraRaw ?? {}) } : args.extraRaw ?? null,
  });

  return { ok: false, status: 422, kind: 'model', error, evaluationId };
}

/**
 * Write the draft.
 *
 * Three writes rather than one nested write because the rows go to three
 * tables. The evaluation row is written first so a failure part way through
 * leaves a visible draft with missing children rather than orphaned children
 * with no parent.
 *
 * With a claim, the claim row is updated to 'draft' in place, guarded on it
 * still being 'running': a claim someone superseded meanwhile (a replaced
 * photo) must not come back to life as the current draft.
 */
async function persist(
  supabase: any,
  args: {
    submissionId: string;
    briefTypeId: string | null;
    actorId: string | null;
    modelId: string;
    raw: string;
    result: EvaluationResult;
    mode: EvalMode;
    claimedEvaluationId: string | null;
    extraRaw?: Record<string, unknown>;
  },
): Promise<string> {
  const fields = {
    brief_type_id: args.briefTypeId,
    status: 'draft',
    provider: 'gemini',
    model_id: args.modelId,
    prompt_version: promptVersionFor(args.mode),
    // The chosen tags are kept with the answer they came from, so the review
    // screen can show what the model suggested even after a teacher edits the
    // sheet's tags.
    raw_response: { text: args.raw, tags: args.result.tags, mode: args.mode, ...(args.extraRaw ?? {}) },
    ai_total: args.result.totalScore,
    overall_comment: args.result.overallComment,
    error: null,
  };

  let evaluationId: string;
  if (args.claimedEvaluationId) {
    const { data: updated, error } = await supabase
      .from('drawing_evaluation')
      .update(fields)
      .eq('id', args.claimedEvaluationId)
      .eq('status', 'running')
      .select('id');
    if (error) {
      throw new Error(`Could not save the evaluation: ${error.message ?? 'update failed'}`);
    }
    if (!Array.isArray(updated) || updated.length !== 1) {
      throw new Error('The draft was replaced while it was being written, so it was not saved.');
    }
    evaluationId = args.claimedEvaluationId;
  } else {
    const { data: evaluation, error } = await supabase
      .from('drawing_evaluation')
      .insert({ ...fields, submission_id: args.submissionId, source: 'ai', created_by: args.actorId })
      .select('id')
      .single();

    if (error || !evaluation) {
      throw new Error(`Could not save the evaluation: ${error?.message ?? 'no row returned'}`);
    }
    evaluationId = evaluation.id as string;
  }

  await supabase.from('drawing_evaluation_criterion').insert(
    args.result.criteria.map((c) => ({
      evaluation_id: evaluationId,
      criterion_key: c.criterionKey,
      ai_band: c.band,
      final_band: c.band,
      confidence: c.confidence,
      closest_anchor_band: c.closestAnchorBand,
      reasoning: c.reasoning,
      was_corrected: false,
    })),
  );

  const annotations = args.result.criteria.flatMap((c) =>
    c.annotations.map((a) => ({
      evaluation_id: evaluationId,
      criterion_key: c.criterionKey,
      source: 'ai',
      action: 'created',
      kind: 'region',
      // Stored as [x, y, w, h] to match the brief's contract. Already
      // normalised by parseEvaluation; nothing downstream rescales.
      geometry: [a.geometry.x, a.geometry.y, a.geometry.width, a.geometry.height],
      marker: a.marker,
      comment: a.comment,
    })),
  );

  if (annotations.length > 0) {
    await supabase.from('drawing_annotation').insert(annotations);
  }

  return evaluationId;
}
