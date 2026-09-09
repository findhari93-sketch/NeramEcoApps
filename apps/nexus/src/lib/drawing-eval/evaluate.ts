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
 */

import { AiBlockedError, generateGemini } from '@neram/ai';

import { buildContext, fetchImagePart } from './brief-context';
import { buildEvaluationParts, buildSystemInstruction } from './prompt';
import {
  parseEvaluation,
  PROMPT_VERSION,
  RESPONSE_SCHEMA,
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
  /** users.id of the teacher who pressed the button, for usage attribution. */
  actorId: string | null;
}

export type EvaluateOutcome =
  | { ok: true; evaluationId: string; result: EvaluationResult; model: string; costUsd: number | null; notes: string[] }
  | { ok: false; status: number; error: string; manualPrompt?: string | null; evaluationId?: string };

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
 */
async function recordFailure(
  supabase: any,
  args: {
    submissionId: string;
    briefTypeId: string | null;
    actorId: string | null;
    error: string;
    modelId?: string | null;
    raw?: unknown;
  },
): Promise<string | undefined> {
  const { data } = await supabase
    .from('drawing_evaluation')
    .insert({
      submission_id: args.submissionId,
      brief_type_id: args.briefTypeId,
      status: 'needs_manual',
      prompt_version: PROMPT_VERSION,
      model_id: args.modelId ?? null,
      raw_response: args.raw ?? null,
      error: args.error,
      created_by: args.actorId,
    })
    .select('id')
    .single();
  return data?.id as string | undefined;
}

export async function evaluateSubmission(args: EvaluateArgs): Promise<EvaluateOutcome> {
  const { supabase, submissionId, actorId } = args;

  const { data: submission } = await supabase
    .from('drawing_submissions')
    .select('id, original_image_url, question_id, assignment_id, exam_qb_question_id')
    .eq('id', submissionId)
    .maybeSingle();

  if (!submission) {
    return { ok: false, status: 404, error: 'Submission not found.' };
  }
  const sub = submission as SubmissionRow;

  const contextOutcome = await buildContext(supabase, sub);
  if (!contextOutcome.ok) {
    // Not an error state worth a row: nothing was attempted and nothing was
    // spent. Answering 409 tells the caller it is a setup gap, not a fault.
    return { ok: false, status: 409, error: contextOutcome.reason };
  }
  const { briefType, criteria, anchors, questionText } = contextOutcome.context;

  const student = await fetchImagePart(sub.original_image_url);
  if (!student) {
    return {
      ok: false,
      status: 422,
      error: 'The student sheet could not be loaded, so there was nothing to evaluate.',
    };
  }

  const parts = buildEvaluationParts({
    briefTitle: briefType.title,
    briefDescription: briefType.description,
    questionText,
    criteria,
    anchors,
    student,
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
        systemInstruction: buildSystemInstruction(),
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
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

      const parsed = parseEvaluation(res.text, expectedKeys);
      if (!parsed.ok) {
        errors.push(...parsed.errors);
        continue;
      }

      const evaluationId = await persist(supabase, {
        submissionId,
        briefTypeId: briefType.id,
        actorId,
        modelId: res.model,
        raw: res.text,
        result: parsed.value,
      });

      return {
        ok: true,
        evaluationId,
        result: parsed.value,
        model: res.model,
        costUsd: res.costUsd,
        notes: parsed.notes,
      };
    } catch (err) {
      if (err instanceof AiBlockedError) {
        // Expected, costs nothing, and for this feature carries the prompt the
        // teacher already pastes into Gemini by hand. Not a failure to record.
        return {
          ok: false,
          status: 409,
          error: err.message,
          manualPrompt: err.manualPrompt,
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      if (/429/.test(message)) {
        return { ok: false, status: 429, error: 'Gemini is rate limited right now. Try again shortly.' };
      }
      errors.push(message);
      break;
    }
  }

  const error = errors.join(' ') || 'The model did not return a usable evaluation.';
  const evaluationId = await recordFailure(supabase, {
    submissionId,
    briefTypeId: briefType.id,
    actorId,
    error,
    modelId: lastModel,
    raw: lastRaw ? { text: lastRaw } : null,
  });

  return { ok: false, status: 422, error, evaluationId };
}

/**
 * Write the draft.
 *
 * Three inserts rather than one nested write because the rows go to three
 * tables. The evaluation row is created first so a failure part way through
 * leaves a visible draft with missing children rather than orphaned children
 * with no parent.
 */
async function persist(
  supabase: any,
  args: {
    submissionId: string;
    briefTypeId: string;
    actorId: string | null;
    modelId: string;
    raw: string;
    result: EvaluationResult;
  },
): Promise<string> {
  const { data: evaluation, error } = await supabase
    .from('drawing_evaluation')
    .insert({
      submission_id: args.submissionId,
      brief_type_id: args.briefTypeId,
      status: 'draft',
      provider: 'gemini',
      model_id: args.modelId,
      prompt_version: PROMPT_VERSION,
      raw_response: { text: args.raw },
      ai_total: args.result.totalScore,
      overall_comment: args.result.overallComment,
      created_by: args.actorId,
    })
    .select('id')
    .single();

  if (error || !evaluation) {
    throw new Error(`Could not save the evaluation: ${error?.message ?? 'no row returned'}`);
  }

  const evaluationId = evaluation.id as string;

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
