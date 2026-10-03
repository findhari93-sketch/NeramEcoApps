/**
 * The index rule shared by every location page: a page is indexed only when it
 * carries enough real local facts to differ from every other place's page.
 * Same shape as apps/marketing/src/lib/seo/location-gate.ts (score of at least
 * 3 with at least one strong fact).
 *
 * Callers turn their facts into signals; this decides. Raise a place into the
 * index by adding real facts, never by loosening these numbers.
 */

export interface GateSignal {
  /** Stable reason code, e.g. 'centre-within-25km'. Shown in tests and debug output. */
  reason: string;
  strength: 'strong' | 'weak';
}

export interface GateRules {
  strongPoints: number;
  weakPoints: number;
  minScore: number;
  minStrong: number;
}

export interface GateResult {
  index: boolean;
  score: number;
  reasons: string[];
}

export const DEFAULT_GATE_RULES: GateRules = {
  strongPoints: 2,
  weakPoints: 1,
  minScore: 3,
  minStrong: 1,
};

export function scoreGate(
  signals: Array<GateSignal | null | undefined | false>,
  rules: GateRules = DEFAULT_GATE_RULES
): GateResult {
  let score = 0;
  let strong = 0;
  const reasons: string[] = [];
  for (const s of signals) {
    if (!s) continue;
    if (s.strength === 'strong') {
      score += rules.strongPoints;
      strong++;
    } else {
      score += rules.weakPoints;
    }
    reasons.push(s.reason);
  }
  return { index: score >= rules.minScore && strong >= rules.minStrong, score, reasons };
}
