/**
 * A teacher's grading profile: what their corrections say about how they grade.
 *
 * COUNTS, NOT PERCENTAGES. "94% agreement" over a hundred-odd sheets has an
 * error bar wider than the number, and the day it disagrees with a teacher's own
 * sense of the tool it discredits the plain sentences beside it, which are the
 * useful half. So this says "learned from 41 of your corrections" and which way
 * they lean, and leaves percentages until there are hundreds per criterion.
 *
 * Zero corrections is its own answer, never "0%".
 */

import { SHARED_CRITERIA, BRIEF_CRITERION } from './drawing-rubric';

export interface CorrectionRow {
  criterion_key: string;
  reference_band: number | null;
  final_band: number | null;
  reference_kind: string | null;
  reason_code: string | null;
  reason_text: string | null;
  corrected_at: string | null;
}

export interface CriterionProfile {
  criterion_key: string;
  title: string;
  corrections: number;
  /** Times the teacher scored above the reference. */
  higher: number;
  /** Times the teacher scored below it. */
  lower: number;
  /** One plain sentence about which way this criterion leans. */
  lean: string;
  /** The most recent sentences typed about this criterion, newest first. */
  sentences: string[];
}

export interface GradingProfile {
  total: number;
  headline: string;
  criteria: CriterionProfile[];
}

export function criterionTitle(key: string): string {
  const all = [...SHARED_CRITERIA, ...Object.values(BRIEF_CRITERION)];
  return all.find((c) => c.key === key)?.title ?? key.replace(/_/g, ' ');
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

function leanFor(higher: number, lower: number): string {
  if (higher === 0 && lower === 0) return 'Recorded without a direction.';
  if (lower === 0) return `You scored above the reference ${times(higher)}, never below.`;
  if (higher === 0) return `You scored below the reference ${times(lower)}, never above.`;
  return `You scored above the reference ${times(higher)} and below it ${times(lower)}.`;
}

export function summariseProfile(rows: CorrectionRow[], sentencesPerCriterion = 3): GradingProfile {
  const valid = rows.filter((r) => r.corrected_at);
  if (valid.length === 0) {
    return {
      total: 0,
      headline: 'Nothing learned yet. When a score of yours differs from the reference and you say why, it is counted here.',
      criteria: [],
    };
  }

  const byKey = new Map<string, CorrectionRow[]>();
  for (const row of valid) {
    const list = byKey.get(row.criterion_key) ?? [];
    list.push(row);
    byKey.set(row.criterion_key, list);
  }

  const criteria = Array.from(byKey.entries()).map(([key, list]) => {
    let higher = 0;
    let lower = 0;
    for (const r of list) {
      if (r.final_band == null || r.reference_band == null) continue;
      if (r.final_band > r.reference_band) higher += 1;
      else if (r.final_band < r.reference_band) lower += 1;
    }
    const sentences = [...list]
      .sort((a, b) => (b.corrected_at ?? '').localeCompare(a.corrected_at ?? ''))
      .map((r) => r.reason_text?.trim())
      .filter((t): t is string => !!t)
      .slice(0, sentencesPerCriterion);
    return { criterion_key: key, title: criterionTitle(key), corrections: list.length, higher, lower, lean: leanFor(higher, lower), sentences };
  });
  criteria.sort((a, b) => b.corrections - a.corrections || a.title.localeCompare(b.title));

  return {
    total: valid.length,
    headline: `Learned from ${valid.length} of your ${valid.length === 1 ? 'correction' : 'corrections'}.`,
    criteria,
  };
}

/**
 * Sentences typed about each criterion and band: the raw material for band
 * descriptions. A sentence written while giving a 2 describes a 2.
 */
export function harvestBandSentences(rows: CorrectionRow[]): Record<string, Record<number, string[]>> {
  const out: Record<string, Record<number, string[]>> = {};
  for (const r of rows) {
    const text = r.reason_text?.trim();
    if (!text || r.final_band == null || r.final_band < 1 || r.final_band > 5) continue;
    const bands = (out[r.criterion_key] ??= {});
    const list = (bands[r.final_band] ??= []);
    if (!list.includes(text)) list.push(text);
  }
  return out;
}
