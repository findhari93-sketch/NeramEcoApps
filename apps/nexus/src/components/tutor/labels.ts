import type { LearningItemKind, MasteryState, SimilarLevel } from '@/lib/assistant/tutor/types';

/** Mastery said in plain words, so colour is never the only signal. */
export const MASTERY_WORD: Record<MasteryState, string> = {
  UNKNOWN: 'Not started',
  INTRODUCED: 'Introduced',
  DEVELOPING: 'Developing',
  PRACTICING: 'Practising',
  STRONG: 'Strong',
  MASTERED: 'Mastered',
};

/** 0 to 5, for the small level meter beside the word. */
export const MASTERY_LEVEL: Record<MasteryState, number> = {
  UNKNOWN: 0,
  INTRODUCED: 1,
  DEVELOPING: 2,
  PRACTICING: 3,
  STRONG: 4,
  MASTERED: 5,
};

export const SIMILAR_LEVEL_LABEL: Record<SimilarLevel, string> = {
  very_similar: 'Almost the same',
  variation: 'A variation',
  extension: 'One new idea',
  challenge: 'Challenge',
};

export const SIMILAR_ORDER: SimilarLevel[] = ['very_similar', 'variation', 'extension', 'challenge'];

export const KIND_LABEL: Record<LearningItemKind, string> = {
  formula: 'Formula',
  concept: 'Concept',
  explanation: 'Explanation',
  mistake: 'Mistake',
  shortcut: 'Shortcut',
  example: 'Example',
  diagram: 'Diagram',
  bookmark: 'Bookmark',
};

/** "A", "B", "C" for a choice's place in the list. */
export const letterOf = (i: number) => 'ABCDEFGH'[i] ?? String(i + 1);

/** "easy" -> "Easy". */
export function difficultyLabel(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = d.trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
}
