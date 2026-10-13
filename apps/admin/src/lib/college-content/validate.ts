/**
 * Holds every FAQ answer to the college's facts.
 *
 * The main check is number grounding: every number in an answer (fees, seats,
 * years, ranks, cutoffs) must appear in the facts. That catches the most
 * damaging kind of AI error on a college page, a made-up fee or cutoff, which
 * a student would act on. Pure, and unit-tested.
 */
import { COMMON_FACTS, type Facts } from './facts';
import type { Faq } from './intents';

export const MAX_ANSWER_WORDS = 100;
export const MIN_ANSWER_WORDS = 5;

/** "₹1,25,000", "1.25", "2026", "40" → numbers. A trailing full stop is not a decimal point. */
export function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((t) => Number(t.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
}

export function allowedNumbers(f: Facts, year: number): Set<number> {
  const out = new Set<number>();
  const add = (v: string | string[]) => (Array.isArray(v) ? v : [v]).forEach((x) => numbersIn(x).forEach((n) => out.add(n)));
  Object.values(f).forEach(add);
  Object.values(COMMON_FACTS).forEach(add);
  // The admission year in questions ("admission in 2027"), the year before
  // ("2026-27" style), small counts ("5 year course", "2 rounds"), and the
  // exam names that carry digits ("Paper 2").
  [year, year - 1, year + 1].forEach((y) => out.add(y));
  for (let i = 0; i <= 12; i++) out.add(i);
  // "2025-26": the short year after the dash.
  for (const n of [...out]) if (n >= 2000 && n <= 2100) out.add(n % 100 + 1).add(n % 100);
  return out;
}

export type Rejection =
  | 'ungrounded-number'
  | 'dash'
  | 'too-long'
  | 'too-short'
  | 'duplicate'
  | 'empty'
  | 'not-a-question'
  | 'filler';

/** Sentences that say nothing, or admit the model had nothing to say. */
const FILLER =
  /provided (information|facts|data)|(does not|doesn't) (include|mention|specify)|not (available|mentioned|specified) in|this (number|figure|indicates|means that|provides|ensures|location provides)|as an ai|i (do not|don't) have|\b(renowned|prestigious|world-class|top-notch|best-in-class)\b/i;

export function checkFaq(faq: Faq, f: Facts, year: number, seenQuestions: Set<string>): Rejection | null {
  const q = faq.question?.trim() ?? '';
  const a = faq.answer?.trim() ?? '';
  if (!q || !a) return 'empty';
  if (!q.endsWith('?')) return 'not-a-question';
  if (/[—–]|--|&mdash;|&ndash;/.test(q + a)) return 'dash';
  if (FILLER.test(a)) return 'filler';
  const words = a.split(/\s+/).length;
  if (words > MAX_ANSWER_WORDS) return 'too-long';
  if (words < MIN_ANSWER_WORDS) return 'too-short';
  const key = q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (seenQuestions.has(key)) return 'duplicate';
  const allowed = allowedNumbers(f, year);
  if (numbersIn(`${q} ${a}`).some((n) => !allowed.has(n))) return 'ungrounded-number';
  seenQuestions.add(key);
  return null;
}
