/**
 * Reading the bodies of the prompt routes: ASK, set key, label and submit.
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

function record(body: unknown): Record<string, unknown> {
  return (body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
}

export interface AskRequest {
  sessionId: string;
  answerType: AnswerType;
  /** mcq only (2 to 6, default 4); null for every other type. */
  optionCount: number | null;
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

  return { ok: true, value: { sessionId: input.sessionId.toLowerCase(), answerType: answerType as AnswerType, optionCount } };
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
