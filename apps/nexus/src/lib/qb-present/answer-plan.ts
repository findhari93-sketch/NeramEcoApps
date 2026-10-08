/**
 * How a question bank question is asked on the Answer Pad: which answer
 * buttons students get, and the answer Reveal grades with.
 *
 * The bank's answers are not stored one way. An MCQ key may be the option's
 * id ("b"), its NTA id, an option marked is_correct, a bare letter, or the
 * option's own text; some keys name an option that does not exist ("4" on a
 * three-option question). Anything this cannot read with certainty gives no
 * key, and the teacher picks one at Reveal as before. A wrong key graded live
 * in front of the class is worse than no key.
 *
 * PURE: no React, no database. The SQL pad_normalize is the single definition
 * of a normalised answer; normalizeNumeric and normalizeText here copy it so
 * the key sent to pad_ask is already in its final form (a test compares them).
 * A formula key (2√3, 3/4, π/2) is sent as its value, the way the pad stores a
 * student's formula answer (formulaValue), and is graded by value.
 */

import { formulaValue } from '@/lib/pad/formula-value';

export interface QBAnswerSource {
  question_format: string | null;
  options: unknown;
  correct_answer: string | null;
}

export type KeyFrom = 'option_id' | 'nta_id' | 'is_correct' | 'letter' | 'option_text' | 'value' | 'formula';

export type AnswerPlan =
  | { type: 'mcq'; optionCount: number; keys: string[] | null; keyFrom: KeyFrom | null }
  | { type: 'numeric'; keys: string[] | null; keyFrom: KeyFrom | null }
  | { type: 'text'; keys: string[] | null; keyFrom: KeyFrom | null }
  | { type: 'show' };

export type PadAnswerType = 'mcq' | 'numeric' | 'text' | 'yesno';

const LETTERS = 'ABCDEF';
/** An MCQ stored with no options carries them in its picture, almost always four. */
const IMAGE_OPTION_COUNT = 4;

interface QBOption {
  id?: unknown;
  nta_id?: unknown;
  text?: unknown;
  is_correct?: unknown;
}

function optionsOf(value: unknown): QBOption[] {
  return Array.isArray(value) ? value.filter((o): o is QBOption => !!o && typeof o === 'object') : [];
}

const squash = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim().replace(/\s+/g, ' ').toLowerCase() : '';

/** pad_normalize('numeric', ...): "012.50" is "12.5", "-0" is "0", "1,000" is "1000". */
export function normalizeNumeric(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let v = raw.replace(/\s+/g, ' ').trim();
  if (!v) return null;
  v = v.replace(/,/g, '').replace(/ /g, '');
  if (v.length > 30 || !/^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$/.test(v)) return null;
  let negative = false;
  if (v[0] === '+' || v[0] === '-') {
    negative = v[0] === '-';
    v = v.slice(1);
  }
  let int: string;
  let frac: string;
  if (v.includes('.')) {
    [int, frac] = v.split('.');
    frac = frac.replace(/0+$/, '');
  } else {
    int = v;
    frac = '';
  }
  int = int.replace(/^0+/, '') || '0';
  const out = int + (frac ? `.${frac}` : '');
  if (out === '0') negative = false;
  return negative ? `-${out}` : out;
}

/** pad_normalize('text', ...): one line, lower case, no closing full stop. */
export function normalizeText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const v = raw.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[.!?]+$/, '').trim();
  return v && v.length <= 100 ? v : null;
}

/** The option the key names, by position, or null when it cannot be told for certain. */
function mcqKeyIndex(options: QBOption[], answer: string): { index: number; from: KeyFrom } | null {
  const key = squash(answer);
  if (!key && !options.some((o) => o.is_correct === true)) return null;

  if (key) {
    const byId = options.findIndex((o) => squash(o.id) === key);
    if (byId >= 0) return { index: byId, from: 'option_id' };
    const byNta = options.findIndex((o) => squash(o.nta_id) === key);
    if (byNta >= 0) return { index: byNta, from: 'nta_id' };
  }

  const marked = options.flatMap((o, i) => (o.is_correct === true ? [i] : []));
  if (marked.length === 1) return { index: marked[0], from: 'is_correct' };

  if (/^[a-f]$/.test(key)) {
    const index = key.charCodeAt(0) - 97;
    if (index < options.length) return { index, from: 'letter' };
    return null;
  }

  const byText = options.flatMap((o, i) => (squash(o.text) && squash(o.text) === key ? [i] : []));
  if (byText.length === 1) return { index: byText[0], from: 'option_text' };
  return null;
}

/** "2:3" style answers: kept as text, written both tight and spaced. ("3/4" is a formula, read first.) */
const RATIO = /^\s*([+-]?\d+(?:\.\d+)?)\s*([:/])\s*(\d+(?:\.\d+)?)\s*$/;

function valuePlan(answer: string | null): AnswerPlan {
  const numeric = normalizeNumeric(answer);
  if (numeric) return { type: 'numeric', keys: [numeric], keyFrom: 'value' };
  const formula = formulaValue(answer);
  if (formula) return { type: 'numeric', keys: [formula], keyFrom: 'formula' };
  const ratio = answer ? RATIO.exec(answer) : null;
  if (ratio) {
    const [, a, sep, b] = ratio;
    const keys = Array.from(new Set([`${a}${sep}${b}`, `${a} ${sep} ${b}`].map((k) => normalizeText(k)!)));
    return { type: 'text', keys, keyFrom: 'value' };
  }
  // "~12", "see figure": there is nothing a typed answer could match.
  return { type: 'numeric', keys: null, keyFrom: null };
}

function mcqPlan(options: QBOption[], answer: string | null): AnswerPlan {
  if (options.length === 0) {
    // The options are in the picture: four buttons, and a letter key if the bank has one.
    const letter = squash(answer);
    const keys = /^[a-d]$/.test(letter) ? [letter.toUpperCase()] : null;
    return { type: 'mcq', optionCount: IMAGE_OPTION_COUNT, keys, keyFrom: keys ? 'letter' : null };
  }
  if (options.length < 2 || options.length > LETTERS.length) return { type: 'show' };
  const found = answer != null || options.some((o) => o.is_correct === true) ? mcqKeyIndex(options, answer ?? '') : null;
  return {
    type: 'mcq',
    optionCount: options.length,
    keys: found ? [LETTERS[found.index]] : null,
    keyFrom: found?.from ?? null,
  };
}

export function answerPlan(q: QBAnswerSource): AnswerPlan {
  const options = optionsOf(q.options);
  const answer = typeof q.correct_answer === 'string' ? q.correct_answer : null;
  switch ((q.question_format ?? '').toUpperCase()) {
    case 'MCQ':
      return mcqPlan(options, answer);
    case 'NUMERICAL':
      return valuePlan(answer);
    case 'IMAGE_BASED':
      return options.length >= 2 ? mcqPlan(options, answer) : valuePlan(answer);
    default:
      // DRAWING_PROMPT, and anything new: shown to the class, never asked on the pad.
      return { type: 'show' };
  }
}

/** What pad_ask is called with. */
export interface AskSpec {
  answerType: PadAnswerType;
  /** MCQ only. */
  optionCount: number | null;
  /** The bank's answer, normalised; null when the teacher decides at Reveal. */
  suggestedKeys: string[] | null;
}

/**
 * The ask for a plan, or for the answer buttons the teacher chose instead.
 * The bank's key is kept only while it still fits: an MCQ asked with fewer
 * options drops a key beyond them, and a different answer type drops it.
 * Null for a show-only question asked with no override.
 */
export function askSpec(plan: AnswerPlan, override?: { answerType: PadAnswerType; optionCount: number | null } | null): AskSpec | null {
  if (!override) {
    if (plan.type === 'show') return null;
    return { answerType: plan.type, optionCount: plan.type === 'mcq' ? plan.optionCount : null, suggestedKeys: plan.keys };
  }
  if (override.answerType === 'mcq') {
    const optionCount = override.optionCount ?? (plan.type === 'mcq' ? plan.optionCount : 4);
    const kept = plan.type === 'mcq' ? (plan.keys ?? []).filter((k) => LETTERS.indexOf(k) < optionCount) : [];
    return { answerType: 'mcq', optionCount, suggestedKeys: kept.length ? kept : null };
  }
  const keys = plan.type === override.answerType ? plan.keys : null;
  return { answerType: override.answerType, optionCount: null, suggestedKeys: keys };
}
