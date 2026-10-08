/**
 * Formula answers on the Answer Pad: 2√3, 3/4, π/2.
 *
 * The server reads a formula with parseMathAnswer (@neram/database, the reader
 * the question bank grades with) and the pad stores its value as a plain
 * decimal written by padDecimal. Everything here works on that stored text, so
 * it is safe in the student pad's bundle: no parser, no imports.
 *
 * Grading mirrors pad_answer_correct (migration 20261109090000): an answer
 * equal to a key is right; a key with seven or more decimal places is a
 * formula's value and also takes an answer within 0.005, so a key of 2√3
 * (3.46410161514) accepts 3.46 and 3.464 but not 3.47, as NTA asks for two
 * decimal places.
 */

import type { AnswerType } from './client/types';

/** How far an answer may sit from a formula's value and still count. */
export const FORMULA_SLACK = 0.005;

/** A stored value with seven or more decimal places came from a formula. */
const FORMULA_VALUE = /\.\d{7,}$/;

/** A plain decimal as pad_normalize('numeric') takes it, commas and spaces allowed. */
const PLAIN_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * A formula's value as the pad stores it: 12 significant digits, which hides
 * floating point noise (√2·√2 is 2, 4/6 and 2/3 are the same text), written
 * without an exponent. Null for a value too large or too small to write out.
 */
export function padDecimal(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Number(value.toPrecision(12));
  const text = Object.is(rounded, -0) ? '0' : String(rounded);
  return /e/i.test(text) ? null : text;
}

export function isFormulaValue(value: string): boolean {
  return FORMULA_VALUE.test(value);
}

/** Whether the text typed is a plain number, which the pad stores as typed. */
export function isPlainNumber(raw: string): boolean {
  return PLAIN_NUMBER.test(raw.replace(/[\s,]/g, ''));
}

/** pad_answer_correct, for screens that mark the right answers in a list. */
export function padAnswerCorrect(answerType: AnswerType, answer: string, keys: readonly string[] | null | undefined): boolean {
  if (!keys?.length) return false;
  if (keys.includes(answer)) return true;
  if (answerType !== 'numeric') return false;
  const value = Number(answer);
  if (!Number.isFinite(value)) return false;
  return keys.some((key) => FORMULA_VALUE.test(key) && Math.abs(value - Number(key)) <= FORMULA_SLACK + 1e-12);
}

/** "≈ 3.4641" for a formula's stored value, at most four decimal places. */
export function shortFormulaValue(value: string): string {
  return `≈ ${Number(Number(value).toFixed(4))}`;
}

/**
 * The answer as the student wrote it, for their own pad: "2√3" rather than the
 * value it is stored as. A plain number shows as stored ("012.50" as "12.5").
 */
export function shownAnswer(answerType: AnswerType, answer: string, raw: string | null | undefined): string {
  const typed = raw?.trim();
  if (answerType === 'numeric' && typed && !isPlainNumber(typed)) return typed;
  return answer;
}
