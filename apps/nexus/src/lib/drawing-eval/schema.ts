/**
 * The evaluation contract, and the only place provider output is trusted.
 *
 * Two jobs:
 *
 * 1. Describe the shape we ask Gemini for (RESPONSE_SCHEMA), so the model is
 *    constrained rather than merely instructed.
 * 2. Validate and normalise what comes back, so that nothing downstream ever
 *    sees a provider convention. Different providers use different coordinate
 *    conventions ([x0,y0,x1,y1] against [x,y,w,h], normalised against pixel
 *    absolute). If raw provider coordinates reached the database, the whole
 *    correction history would be provider-locked and worthless the day the
 *    model changes. So: normalise here, nowhere else.
 *
 * Deliberately hand-rolled rather than reaching for a validation library. The
 * repo has no schema library on this path and the brief forbids new paid or
 * unpaid dependencies for this feature.
 */

import { clampRect, isNormRect, type NormRect } from '@/lib/annotation-geometry';

/**
 * Bumped whenever the prompt or the response contract changes, so shadow
 * agreement never mixes answers to two different questions.
 *
 * v2: overallComment became 3 to 4 sentences to the student, tags were added,
 * and closestAnchorBand became optional. Generic drafts (no reference sheets)
 * carry their own version string so their agreement is measured separately
 * from anchored ones: they answer a harder question with less help.
 */
export const PROMPT_VERSION = 'drawing-eval-v2';
export const GENERIC_PROMPT_VERSION = 'drawing-eval-v2-generic';

/**
 * anchored: placed against five graded reference sheets for an active brief.
 * generic:  graded against the observable checks alone, on whatever criteria
 *           the rubric panel shows for this sheet.
 */
export type EvalMode = 'anchored' | 'generic';

export function promptVersionFor(mode: EvalMode): string {
  return mode === 'generic' ? GENERIC_PROMPT_VERSION : PROMPT_VERSION;
}

/** Most tags a draft may put on a sheet. */
export const MAX_DRAFT_TAGS = 3;

export type Marker = 'problem' | 'good' | 'guide' | 'note';
export type Confidence = 'high' | 'medium' | 'low';
export type Band = 1 | 2 | 3 | 4 | 5;

export interface EvalAnnotation {
  /** Phase 1 asks the model for rectangles only. The table allows more. */
  kind: 'region';
  /** Image-relative, normalised 0 to 1, origin top-left. */
  geometry: NormRect;
  marker: Marker;
  criterionKey: string;
  comment: string;
}

export interface CriterionResult {
  criterionKey: string;
  band: Band;
  /** Must cite something visible in the sheet, not a generic statement. */
  reasoning: string;
  /** Null in generic mode, where there are no reference sheets to be closest to. */
  closestAnchorBand: Band | null;
  confidence: Confidence;
  annotations: EvalAnnotation[];
}

export interface EvaluationResult {
  criteria: CriterionResult[];
  /** Mean of the criterion bands, on the same 1 to 5 scale the UI already uses. */
  totalScore: number;
  overallComment: string;
  flags: string[];
  /** Labels from the supplied tag list only, in its spelling, at most three. */
  tags: string[];
}

export type ParseOutcome =
  | { ok: true; value: EvaluationResult; notes: string[] }
  | { ok: false; errors: string[] };

const MARKERS: Marker[] = ['problem', 'good', 'guide', 'note'];
const CONFIDENCES: Confidence[] = ['high', 'medium', 'low'];

/**
 * Structured-output schema handed to Gemini.
 *
 * Worth constraining rather than trusting prose: the failure this prevents is
 * a model that returns four numbers in a different order, which validates as
 * a rectangle and silently marks the wrong part of the drawing.
 *
 * Built per call because the tag enum comes from the drawing_tags table. Gemini
 * rejects an empty enum, so with no tags the property is left out altogether.
 */
export function buildEvaluationSchema(tagLabels: readonly string[] = []) {
  const labels = Array.from(new Set(tagLabels.map((l) => l.trim()).filter(Boolean)));
  return {
    type: 'object',
    properties: {
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            criterionKey: { type: 'string' },
            band: { type: 'integer' },
            reasoning: { type: 'string' },
            // Optional: only an anchored draft has a reference sheet to name.
            closestAnchorBand: { type: 'integer' },
            confidence: { type: 'string', enum: CONFIDENCES },
            annotations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  geometry: {
                    type: 'array',
                    items: { type: 'number' },
                    description:
                      'Exactly four numbers [x, y, width, height], each a fraction of the STUDENT SHEET between 0 and 1, origin top-left.',
                  },
                  marker: { type: 'string', enum: MARKERS },
                  comment: { type: 'string' },
                },
                required: ['geometry', 'marker', 'comment'],
              },
            },
          },
          required: ['criterionKey', 'band', 'reasoning', 'confidence', 'annotations'],
        },
      },
      overallComment: { type: 'string' },
      flags: { type: 'array', items: { type: 'string' } },
      ...(labels.length > 0 ? { tags: { type: 'array', items: { type: 'string', enum: labels } } } : {}),
    },
    required: ['criteria', 'overallComment'],
  };
}

/** The schema with no tag list, for callers and tests that only need the shape. */
export const RESPONSE_SCHEMA = buildEvaluationSchema([]);

function asBand(value: unknown): Band | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? (r as Band) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Text a student will read, with dashes used as punctuation turned into commas.
 *
 * The prompt already says never to use them, and the model does anyway often
 * enough to matter: a dash in feedback reads as machine written, which is the
 * one impression a teacher sending it cannot afford. Hyphens inside words
 * (well-lit, two-point) are left alone.
 */
export function withoutDashes(text: string): string {
  return text
    // U+2014 em dash, U+2013 en dash, and a run of two or more hyphens.
    .replace(/\s*(?:\u2014|\u2013|-{2,})\s*/g, ', ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/,\s*([.,;:!?])/g, '$1')
    .replace(/^,\s*/, '')
    .replace(/,\s*$/, '.')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** The model's tags, kept only when they are on the supplied list, in the list's spelling. */
function pickTags(value: unknown, tagLabels: readonly string[]): string[] {
  if (!Array.isArray(value) || tagLabels.length === 0) return [];
  const canonical = new Map(tagLabels.map((l) => [l.trim().toLowerCase(), l.trim()]));
  const out: string[] = [];
  for (const raw of value) {
    const label = canonical.get(asString(raw).toLowerCase());
    if (label && !out.includes(label)) out.push(label);
    if (out.length >= MAX_DRAFT_TAGS) break;
  }
  return out;
}

export interface ParseOptions {
  /** Generic drafts have no reference sheet, so closestAnchorBand is stored as null. */
  mode?: EvalMode;
  /** The tags the model was offered. Anything else it returns is dropped. */
  tagLabels?: readonly string[];
}

/**
 * Decide, once for the whole response, what scale its coordinates are in.
 *
 * A per-value guess would be wrong: 0.5 is a valid fraction and a valid
 * percentage. Across a whole response it is unambiguous, because a set of
 * genuine fractions can never contain a value above 1. So a single value over
 * 1 proves the response is not fractional, and if everything then fits inside
 * 0 to 100 the only convention it can be is percent.
 *
 * Anything else is rejected rather than rescaled. Guessing at pixel scale
 * would need the sheet's dimensions and would fail silently when wrong.
 */
type Scale = 'fraction' | 'percent' | 'unknown';

export function detectScale(values: number[]): Scale {
  const finite = values.filter((n) => Number.isFinite(n));
  if (finite.length === 0) return 'unknown';
  const max = Math.max(...finite);
  const min = Math.min(...finite);
  if (min < 0) return 'unknown';
  if (max <= 1.0001) return 'fraction';
  if (max <= 100.0001) return 'percent';
  return 'unknown';
}

function toRect(geometry: unknown, scale: Scale): NormRect | null {
  if (!Array.isArray(geometry) || geometry.length !== 4) return null;
  const nums = geometry.map((n) => (typeof n === 'number' ? n : Number(n)));
  if (!nums.every((n) => Number.isFinite(n))) return null;

  const divisor = scale === 'percent' ? 100 : 1;
  const rect: NormRect = {
    x: nums[0] / divisor,
    y: nums[1] / divisor,
    width: nums[2] / divisor,
    height: nums[3] / divisor,
  };

  if (rect.width <= 0 || rect.height <= 0) return null;
  // Trim a box that runs a little past the edge rather than dropping it: a
  // model marking something at the margin is right about the location.
  const clamped = clampRect(rect);
  if (clamped.width <= 0 || clamped.height <= 0) return null;
  return isNormRect(clamped) ? clamped : null;
}

/** Every coordinate in the payload, for the one-shot scale decision. */
function collectCoordinates(criteria: unknown[]): number[] {
  const out: number[] = [];
  for (const c of criteria) {
    const anns = (c as { annotations?: unknown })?.annotations;
    if (!Array.isArray(anns)) continue;
    for (const a of anns) {
      const g = (a as { geometry?: unknown })?.geometry;
      if (Array.isArray(g)) {
        for (const n of g) if (typeof n === 'number') out.push(n);
      }
    }
  }
  return out;
}

/**
 * Parse, validate and normalise one model response.
 *
 * `expectedKeys` is the criterion set for this brief type. A response naming a
 * criterion that does not exist is rejected outright rather than stored: a
 * band filed under an invented key would silently never be shown and never be
 * corrected, which quietly poisons the training signal.
 */
export function parseEvaluation(
  raw: string,
  expectedKeys: string[],
  options: ParseOptions = {},
): ParseOutcome {
  const mode: EvalMode = options.mode ?? 'anchored';
  const errors: string[] = [];
  const notes: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['Response was not valid JSON.'] };
  }

  const root = parsed as { criteria?: unknown; overallComment?: unknown; flags?: unknown; tags?: unknown };
  if (!Array.isArray(root?.criteria) || root.criteria.length === 0) {
    return { ok: false, errors: ['Response contained no criteria.'] };
  }

  const scale = detectScale(collectCoordinates(root.criteria));
  if (scale === 'percent') {
    notes.push('Coordinates arrived in percent and were converted to fractions.');
  }

  const seen = new Set<string>();
  const criteria: CriterionResult[] = [];

  for (const entry of root.criteria) {
    const c = entry as Record<string, unknown>;
    const criterionKey = asString(c.criterionKey);

    if (!criterionKey) {
      errors.push('A criterion had no criterionKey.');
      continue;
    }
    if (!expectedKeys.includes(criterionKey)) {
      errors.push(`Unknown criterion "${criterionKey}".`);
      continue;
    }
    if (seen.has(criterionKey)) {
      errors.push(`Criterion "${criterionKey}" appeared more than once.`);
      continue;
    }
    seen.add(criterionKey);

    const band = asBand(c.band);
    if (band === null) {
      errors.push(`Criterion "${criterionKey}" had no band in 1 to 5.`);
      continue;
    }

    const reasoning = withoutDashes(asString(c.reasoning));
    if (!reasoning) {
      errors.push(`Criterion "${criterionKey}" gave no reasoning.`);
      continue;
    }

    const confidence = CONFIDENCES.includes(c.confidence as Confidence)
      ? (c.confidence as Confidence)
      : 'low';

    const annotations: EvalAnnotation[] = [];
    const rawAnns = Array.isArray(c.annotations) ? c.annotations : [];
    for (const a of rawAnns) {
      const ann = a as Record<string, unknown>;
      const geometry = toRect(ann.geometry, scale);
      if (!geometry) {
        // One unusable box does not sink an otherwise good criterion, but it
        // is recorded so a model that drifts on coordinates is visible.
        notes.push(`Dropped an unusable annotation on "${criterionKey}".`);
        continue;
      }
      annotations.push({
        kind: 'region',
        geometry,
        marker: MARKERS.includes(ann.marker as Marker) ? (ann.marker as Marker) : 'note',
        criterionKey,
        comment: withoutDashes(asString(ann.comment)),
      });
    }

    criteria.push({
      criterionKey,
      band,
      reasoning,
      closestAnchorBand: mode === 'generic' ? null : asBand(c.closestAnchorBand) ?? band,
      confidence,
      annotations,
    });
  }

  const missing = expectedKeys.filter((k) => !criteria.some((c) => c.criterionKey === k));
  if (missing.length > 0) {
    // A partial answer is not a usable draft: a teacher would have to work out
    // which criteria the model silently skipped.
    errors.push(`Missing criteria: ${missing.join(', ')}.`);
  }

  // Any structural complaint is fatal. The alternative is writing a record
  // that looks complete but is missing a band, carries one filed under an
  // invented key, or holds two contradictory answers for the same criterion.
  // A teacher can act on "the model could not do this one"; they cannot spot
  // a draft that is quietly wrong. Unusable annotations are not counted here,
  // they go to `notes`, because losing one box does not distort the result.
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (criteria.length === 0) {
    return { ok: false, errors: ['No criterion validated.'] };
  }

  const totalScore =
    Math.round((criteria.reduce((sum, c) => sum + c.band, 0) / criteria.length) * 100) / 100;

  return {
    ok: true,
    notes,
    value: {
      criteria,
      totalScore,
      overallComment: withoutDashes(asString(root.overallComment)),
      flags: Array.isArray(root.flags) ? root.flags.map(asString).filter(Boolean) : [],
      tags: pickTags(root.tags, options.tagLabels ?? []),
    },
  };
}
