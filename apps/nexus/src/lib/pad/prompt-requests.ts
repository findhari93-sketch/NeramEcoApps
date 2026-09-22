/**
 * Reading the bodies of the prompt routes: ASK, set key, label, details,
 * picture, submit and the student's reason for not answering.
 *
 * Only the shape is checked here. What the values mean (a key letter beyond the
 * option count, an answer that is not a number) is the database's call, in
 * pad_normalize and the transition functions, so there is one definition.
 */

import { isUuid, type Parsed } from './session-binding';

export const ANSWER_TYPES = ['mcq', 'numeric', 'text', 'yesno'] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

const MAX_KEYS = 50;
const MAX_KEY_LENGTH = 100;
const MAX_ANSWER_LENGTH = 200;
/** Raw length; the database collapses spaces and caps the stored label at 80. */
const MAX_LABEL_LENGTH = 200;
/** Raw length; the database tidies spacing and caps the stored question at 500. */
const MAX_TEXT_LENGTH = 2000;
/** The database checks the picture is this session's own upload; this only bounds the size. */
const MAX_IMAGE_URL_LENGTH = 1024;
/** Raw length of one option's text; the database caps the stored text at 200. */
const MAX_OPTION_TEXT_LENGTH = 400;
/** Raw length; the database caps the stored note at 80. */
const MAX_NOTE_LENGTH = 200;

export const SKIP_REASONS = ['dont_know', 'cant_see', 'need_time', 'tech_problem', 'other'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

function record(body: unknown): Record<string, unknown> {
  return (body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
}

export interface AskRequest {
  sessionId: string;
  answerType: AnswerType;
  /** mcq only (2 to 6, default 4); null for every other type. */
  optionCount: number | null;
  /** The teacher's reference for the question ("38" for Q.38); null for none. */
  label: string | null;
  /** The question as typed or dictated; null for none. */
  text: string | null;
  /** A picture uploaded through /api/pad/sessions/:id/image; null for none. */
  imageUrl: string | null;
  /** Multiple choice only: one entry per option, null where left blank. */
  optionTexts: Array<string | null> | null;
}

/** An optional string field: absent, null or a string within the limit. */
function optionalText(value: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string' || value.length > max) return { ok: false };
  return { ok: true, value };
}

export function parseAskRequest(body: unknown): Parsed<AskRequest> {
  const input = record(body);
  if (!isUuid(input.sessionId)) return { ok: false, field: 'sessionId' };

  const answerType = input.answerType === undefined ? 'mcq' : input.answerType;
  if (typeof answerType !== 'string' || !(ANSWER_TYPES as readonly string[]).includes(answerType)) {
    return { ok: false, field: 'answerType' };
  }

  let optionCount: number | null = null;
  if (answerType === 'mcq') {
    const raw = input.optionCount === undefined || input.optionCount === null ? 4 : input.optionCount;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 2 || raw > 6) return { ok: false, field: 'optionCount' };
    optionCount = raw;
  }

  const label = optionalText(input.label, MAX_LABEL_LENGTH);
  if (!label.ok) return { ok: false, field: 'label' };
  const text = optionalText(input.text, MAX_TEXT_LENGTH);
  if (!text.ok) return { ok: false, field: 'text' };
  const imageUrl = optionalText(input.imageUrl, MAX_IMAGE_URL_LENGTH);
  if (!imageUrl.ok) return { ok: false, field: 'imageUrl' };

  let optionTexts: Array<string | null> | null = null;
  if (input.optionTexts !== undefined && input.optionTexts !== null) {
    const raw = input.optionTexts;
    if (!Array.isArray(raw) || raw.length > 6) return { ok: false, field: 'optionTexts' };
    for (const entry of raw) {
      if (entry !== null && (typeof entry !== 'string' || entry.length > MAX_OPTION_TEXT_LENGTH)) return { ok: false, field: 'optionTexts' };
    }
    // Only multiple choice carries option text; the database drops it for anything else too.
    optionTexts = answerType === 'mcq' ? (raw as Array<string | null>) : null;
  }

  return {
    ok: true,
    value: {
      sessionId: input.sessionId.toLowerCase(),
      answerType: answerType as AnswerType,
      optionCount,
      label: label.value,
      text: text.value,
      imageUrl: imageUrl.value,
      optionTexts,
    },
  };
}

/** The picture for a question already asked: a new upload's address, or null to take it off. */
export function parsePictureRequest(body: unknown): Parsed<{ imageUrl: string | null }> {
  const input = record(body);
  const imageUrl = optionalText(input.imageUrl, MAX_IMAGE_URL_LENGTH);
  if (!imageUrl.ok) return { ok: false, field: 'imageUrl' };
  return { ok: true, value: { imageUrl: imageUrl.value } };
}

export interface SkipRequest {
  promptId: string;
  /** Null withdraws the reason. */
  reason: SkipReason | null;
  note: string | null;
}

/** "I can't answer": a reason from the list, an optional short note, or null to take it back. */
export function parseSkipRequest(body: unknown): Parsed<SkipRequest> {
  const input = record(body);
  if (!isUuid(input.promptId)) return { ok: false, field: 'promptId' };
  const reason = input.reason ?? null;
  if (reason !== null && (typeof reason !== 'string' || !(SKIP_REASONS as readonly string[]).includes(reason))) {
    return { ok: false, field: 'reason' };
  }
  const note = optionalText(input.note, MAX_NOTE_LENGTH);
  if (!note.ok) return { ok: false, field: 'note' };
  return { ok: true, value: { promptId: input.promptId.toLowerCase(), reason: reason as SkipReason | null, note: note.value } };
}

/** Either the correct answers, or Poll / Don't grade. Never both. */
export type KeyRequest = { ungraded: true; keys: null } | { ungraded: false; keys: string[] };

export function parseKeyRequest(body: unknown): Parsed<KeyRequest> {
  const input = record(body);

  if (input.ungraded === true) {
    if (input.keys !== undefined && input.keys !== null) return { ok: false, field: 'keys' };
    return { ok: true, value: { ungraded: true, keys: null } };
  }
  if (input.ungraded !== undefined && input.ungraded !== false) return { ok: false, field: 'ungraded' };

  const keys = input.keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_KEYS) return { ok: false, field: 'keys' };
  for (const key of keys) {
    if (typeof key !== 'string' || key.trim().length === 0 || key.length > MAX_KEY_LENGTH) return { ok: false, field: 'keys' };
  }
  return { ok: true, value: { ungraded: false, keys: keys as string[] } };
}

/** The reference and the question text together, as the teacher last saw them. */
export function parseDetailsRequest(body: unknown): Parsed<{ label: string | null; text: string | null }> {
  const input = record(body);
  const label = optionalText(input.label, MAX_LABEL_LENGTH);
  if (!label.ok) return { ok: false, field: 'label' };
  const text = optionalText(input.text, MAX_TEXT_LENGTH);
  if (!text.ok) return { ok: false, field: 'text' };
  return { ok: true, value: { label: label.value, text: text.value } };
}

export function parseLabelRequest(body: unknown): Parsed<{ label: string | null }> {
  const input = record(body);
  if (input.label === undefined || input.label === null) return { ok: true, value: { label: null } };
  if (typeof input.label !== 'string' || input.label.length > MAX_LABEL_LENGTH) return { ok: false, field: 'label' };
  return { ok: true, value: { label: input.label } };
}

export interface SubmitRequest {
  promptId: string;
  /** Exactly as typed or tapped; pad_submit normalises it. */
  answer: string;
}

export function parseSubmitRequest(body: unknown): Parsed<SubmitRequest> {
  const input = record(body);
  if (!isUuid(input.promptId)) return { ok: false, field: 'promptId' };
  if (typeof input.answer !== 'string' || input.answer.trim().length === 0 || input.answer.length > MAX_ANSWER_LENGTH) {
    return { ok: false, field: 'answer' };
  }
  return { ok: true, value: { promptId: input.promptId.toLowerCase(), answer: input.answer } };
}
