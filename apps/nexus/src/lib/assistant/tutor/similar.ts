/**
 * Sorts similar-question candidates (from the nexus_tutor_similar_candidates
 * RPC: same concepts, not the same repeat group, not already answered
 * correctly) into the four levels the tutor offers. Pure.
 *
 *   very_similar: almost the same ideas (concept overlap >= 0.8) at the same difficulty
 *   variation:    the same ideas in another shape (overlap >= 0.5, or a different difficulty)
 *   extension:    every core idea of this question plus exactly one new one
 *   challenge:    two or more new ideas, or harder
 *
 * One question per level, so the student chooses how far to stretch.
 * Questions with a tutor pack come first (the tutor can help there too),
 * then ones not yet attempted, then ones whose new ideas the student has met.
 */
import type { MasteryState, SimilarLevel } from './types';

export interface Candidate {
  question_id: string;
  concept_ids: string[];
  core_ids: string[];
  difficulty: string | null;
  attempted: boolean;
  has_pack: boolean;
}

export interface Source {
  conceptIds: string[];
  coreIds: string[];
  difficulty: string | null;
}

const RANK: Record<string, number> = { EASY: 1, MEDIUM: 2, HARD: 3 };
const LEVELS: SimilarLevel[] = ['very_similar', 'variation', 'extension', 'challenge'];
const MET: ReadonlySet<MasteryState> = new Set(['DEVELOPING', 'PRACTICING', 'STRONG', 'MASTERED']);

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function levelOf(src: Source, c: Candidate): SimilarLevel | null {
  const overlap = jaccard(src.conceptIds, c.concept_ids);
  const srcSet = new Set(src.conceptIds);
  const extra = c.concept_ids.filter((id) => !srcSet.has(id));
  const coversCore = src.coreIds.every((id) => c.concept_ids.includes(id));
  // A stretch must still be about this question's main idea, or it is just another topic.
  const sharesCore = src.coreIds.some((id) => c.concept_ids.includes(id));
  const sameDiff = (src.difficulty ?? '') === (c.difficulty ?? '');
  const harder = (RANK[c.difficulty ?? ''] ?? 2) > (RANK[src.difficulty ?? ''] ?? 2);
  if (overlap >= 0.8 && sameDiff) return 'very_similar';
  if (coversCore && extra.length === 1) return 'extension';
  if (sharesCore && (extra.length >= 2 || harder)) return 'challenge';
  if (overlap >= 0.5) return 'variation';
  return null;
}

export function pickSimilar(
  src: Source,
  candidates: Candidate[],
  masteryById: Record<string, MasteryState>,
): Array<{ questionId: string; level: SimilarLevel; hasPack: boolean }> {
  const score = (c: Candidate) => {
    const srcSet = new Set(src.conceptIds);
    const newIdeasMet = c.concept_ids.filter((id) => !srcSet.has(id)).every((id) => MET.has(masteryById[id] ?? 'UNKNOWN'));
    return (c.has_pack ? 4 : 0) + (c.attempted ? 0 : 2) + (newIdeasMet ? 1 : 0) + jaccard(src.conceptIds, c.concept_ids);
  };
  const best = new Map<SimilarLevel, Candidate>();
  for (const c of candidates) {
    const level = levelOf(src, c);
    if (!level) continue;
    const cur = best.get(level);
    if (!cur || score(c) > score(cur) || (score(c) === score(cur) && c.question_id < cur.question_id)) best.set(level, c);
  }
  return LEVELS.filter((l) => best.has(l)).map((l) => ({ questionId: best.get(l)!.question_id, level: l, hasPack: best.get(l)!.has_pack }));
}
