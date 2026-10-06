/**
 * Concept mastery from evidence, never from one answer and never as a label
 * on the student. Each piece of evidence moves the score a step toward a
 * target; the state is read from the score plus how much of the evidence was
 * independent. Pure.
 *
 *   independent correct            -> 1.0
 *   correct with a little help     -> 0.75  (1 or 2 hints, or a guided step first try)
 *   correct with a lot of help     -> 0.5   (3 or 4 hints, or a step after misses)
 *   solution revealed              -> 0.3
 *   wrong, a real misunderstanding -> 0
 *   wrong, a slip (sign, arithmetic, careless, units) -> score x 0.85 (a slip is not ignorance)
 */
import { SLIP_CODES, type ErrorCode } from './pack';
import type { Evidence } from './engine';
import type { MasteryState } from './types';

export interface MasteryRow {
  state: MasteryState;
  score: number;
  evidence_n: number;
  independent_n: number;
  hard_independent_n: number;
  last_result: 'correct' | 'wrong' | null;
  last_error_code: string | null;
}

export const EMPTY_MASTERY: MasteryRow = {
  state: 'UNKNOWN', score: 0, evidence_n: 0, independent_n: 0, hard_independent_n: 0, last_result: null, last_error_code: null,
};

const RATE = 0.35;
const SLIP_KEEP = 0.85;

const TARGET: Record<Exclude<Evidence, 'wrong'>, number> = {
  independent: 1,
  hint_light: 0.75,
  hint_heavy: 0.5,
  revealed: 0.3,
};

export function stateOf(row: Omit<MasteryRow, 'state'>): MasteryState {
  if (row.evidence_n === 0) return 'UNKNOWN';
  if (row.evidence_n < 2) return 'INTRODUCED';
  if (row.score >= 0.85 && row.independent_n >= 3 && row.hard_independent_n >= 1 && row.last_result !== 'wrong') return 'MASTERED';
  if (row.score >= 0.7 && row.independent_n >= 2) return 'STRONG';
  if (row.score >= 0.5) return 'PRACTICING';
  return 'DEVELOPING';
}

export function applyEvidence(
  prev: MasteryRow | null,
  ev: { evidence: Evidence; errorCode: ErrorCode | null; hard?: boolean },
): MasteryRow {
  const r = { ...(prev ?? EMPTY_MASTERY) };
  if (ev.evidence === 'wrong') {
    r.score = ev.errorCode && SLIP_CODES.has(ev.errorCode) ? r.score * SLIP_KEEP : r.score + RATE * (0 - r.score);
    r.last_result = 'wrong';
    r.last_error_code = ev.errorCode;
  } else {
    r.score = r.score + RATE * (TARGET[ev.evidence] - r.score);
    r.last_result = 'correct';
    r.last_error_code = null;
    if (ev.evidence === 'independent') {
      r.independent_n += 1;
      if (ev.hard) r.hard_independent_n += 1;
    }
  }
  r.score = Math.max(0, Math.min(1, Number(r.score.toFixed(4))));
  r.evidence_n += 1;
  r.state = stateOf(r);
  return r;
}

/** Plain words for a state, for students. */
export const MASTERY_WORDS: Record<MasteryState, string> = {
  UNKNOWN: 'Not started',
  INTRODUCED: 'Introduced',
  DEVELOPING: 'Developing',
  PRACTICING: 'Practising',
  STRONG: 'Strong',
  MASTERED: 'Mastered',
};
