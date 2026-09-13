/**
 * The teaching moment: when a score disagrees with something, ask why.
 *
 * A score only teaches anything when it can be compared. With no model running,
 * the thing a teacher disagrees with is the student's own history or the class:
 *
 *   1. the AI's draft band, once drafts exist (any difference counts);
 *   2. this student's previous attempt at this assignment;
 *   3. this student's most recent score on the same criterion elsewhere;
 *   4. the class average on this criterion for this assignment, once at least
 *      three classmates are scored, because two scores are not an average.
 *
 * Only a gap of two bands or more asks, against anything but the AI. One band
 * is ordinary drift between two drawings; asking about it every time would
 * teach the teacher to press Skip without reading.
 *
 * The answer is three taps or a typed sentence. The typed sentence is the one
 * that matters most later: filed under its criterion and band, it is the band
 * description in the teacher's own words.
 */

import type { Band } from './drawing-rubric';

export type ReferenceKind = 'ai' | 'previous_attempt' | 'student_last' | 'class_average';
export type ReasonCode = 'work_changed' | 'too_small' | 'brief_weight' | 'other';

export interface ReferenceInputs {
  aiBand?: number | null;
  previousAttemptBand?: number | null;
  studentLastBand?: number | null;
  classBands?: number[];
}

export interface Reference {
  band: Band;
  kind: ReferenceKind;
  /** Says what the reference is, in words, for the prompt. */
  sentence: string;
}

/** Classmates that must be scored before their average means anything. */
export const MIN_CLASS_SAMPLE = 3;
/** Bands apart before a non-AI reference is worth asking about. */
export const DISAGREEMENT = 2;
export const MAX_REASON_TEXT = 400;

export const REASONS: ReadonlyArray<{ code: Exclude<ReasonCode, 'other'>; label: string }> = [
  { code: 'work_changed', label: 'The drawing itself earns this score' },
  { code: 'too_small', label: 'The error is real, but not worth a whole band' },
  { code: 'brief_weight', label: 'This brief makes this criterion matter more' },
];

const isBand = (n: unknown): n is Band => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5;

export function referenceFor(inputs: ReferenceInputs): Reference | null {
  if (isBand(inputs.aiBand)) {
    return { band: inputs.aiBand, kind: 'ai', sentence: `The draft gave ${inputs.aiBand} here.` };
  }
  if (isBand(inputs.previousAttemptBand)) {
    return {
      band: inputs.previousAttemptBand,
      kind: 'previous_attempt',
      sentence: `Their previous attempt scored ${inputs.previousAttemptBand} here.`,
    };
  }
  if (isBand(inputs.studentLastBand)) {
    return {
      band: inputs.studentLastBand,
      kind: 'student_last',
      sentence: `Their last drawing scored ${inputs.studentLastBand} here.`,
    };
  }
  const classBands = (inputs.classBands ?? []).filter(isBand);
  if (classBands.length >= MIN_CLASS_SAMPLE) {
    const mean = classBands.reduce((a, b) => a + b, 0) / classBands.length;
    const band = Math.min(5, Math.max(1, Math.round(mean))) as Band;
    return {
      band,
      kind: 'class_average',
      sentence: `The class averages ${(Math.round(mean * 10) / 10).toFixed(1)} here, across ${classBands.length} drawings.`,
    };
  }
  return null;
}

export function shouldAsk(finalBand: number | null | undefined, reference: Reference | null): boolean {
  if (!isBand(finalBand) || !reference) return false;
  const gap = Math.abs(finalBand - reference.band);
  return reference.kind === 'ai' ? gap >= 1 : gap >= DISAGREEMENT;
}

/** The question itself, e.g. "You gave 2. Their previous attempt scored 4 here." */
export function promptFor(finalBand: Band, reference: Reference): string {
  return `You gave ${finalBand}. ${reference.sentence}`;
}

export interface CorrectionInput {
  criterion_key: string;
  final_band: Band;
  reference_band: Band;
  reference_kind: ReferenceKind;
  reason_code: ReasonCode;
  reason_text: string | null;
  remember: boolean;
}

/** Accept a correction off the wire, or say what is wrong with it. */
export function parseCorrection(raw: unknown): { ok: true; value: CorrectionInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Nothing to record' };
  const b = raw as Record<string, unknown>;
  if (typeof b.criterion_key !== 'string' || !/^[a-z_]{1,60}$/.test(b.criterion_key)) {
    return { ok: false, error: 'Which criterion?' };
  }
  if (!isBand(b.final_band) || !isBand(b.reference_band)) return { ok: false, error: 'Bands run 1 to 5' };
  const kinds: ReferenceKind[] = ['ai', 'previous_attempt', 'student_last', 'class_average'];
  if (typeof b.reference_kind !== 'string' || !(kinds as string[]).includes(b.reference_kind)) {
    return { ok: false, error: 'Unknown reference' };
  }
  const text = typeof b.reason_text === 'string' ? b.reason_text.trim().replace(/\s+/g, ' ') : '';
  if (text.length > MAX_REASON_TEXT) return { ok: false, error: `Keep it under ${MAX_REASON_TEXT} characters` };
  const codes: ReasonCode[] = ['work_changed', 'too_small', 'brief_weight', 'other'];
  let code = typeof b.reason_code === 'string' && (codes as string[]).includes(b.reason_code) ? (b.reason_code as ReasonCode) : null;
  if (!code && text) code = 'other';
  if (!code) return { ok: false, error: 'Pick a reason or type one' };
  if (code === 'other' && text.length < 3) return { ok: false, error: 'Type the reason' };
  return {
    ok: true,
    value: {
      criterion_key: b.criterion_key,
      final_band: b.final_band,
      reference_band: b.reference_band,
      reference_kind: b.reference_kind as ReferenceKind,
      reason_code: code,
      reason_text: text || null,
      remember: b.remember === true,
    },
  };
}

/** The sentence a kept rule carries: what they typed, else the reason they tapped. */
export function ruleTextFor(input: Pick<CorrectionInput, 'reason_code' | 'reason_text'>): string {
  if (input.reason_text) return input.reason_text;
  return REASONS.find((r) => r.code === input.reason_code)?.label ?? 'My own reason';
}
