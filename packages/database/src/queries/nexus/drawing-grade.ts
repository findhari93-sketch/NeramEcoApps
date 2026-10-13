import type { DrawingGrade, SketchbookReaction } from '../../types';

/**
 * A grade for one practice drawing, and the single rule for "evaluated".
 *
 * A practice drawing is evaluated once it has a grade AND a reaction; a comment
 * is optional. evaluated_at carries that fact so the flip through list, the nav
 * badge and the review screen all read one column. Pure, so the rule is tested
 * without a database.
 */

export const DRAWING_GRADES: readonly DrawingGrade[] = ['top', 'mid', 'needs_practice'];

export const DRAWING_GRADE_LABEL: Record<DrawingGrade, string> = {
  top: 'Top',
  mid: 'Mid',
  needs_practice: 'Needs practice',
};

export function isDrawingGrade(value: unknown): value is DrawingGrade {
  return typeof value === 'string' && (DRAWING_GRADES as readonly string[]).includes(value);
}

export interface EvaluationState {
  reaction: SketchbookReaction | null;
  drawing_grade: DrawingGrade | null;
  evaluated_at: string | null;
}

/** Where a practice drawing stands, for the chip on the card. */
export type EvaluationStatus = 'evaluated' | 'needs_grade' | 'needs_reaction' | 'not_started';

export function evaluationStatus(state: Pick<EvaluationState, 'reaction' | 'drawing_grade'> & { evaluated_at?: string | null }): EvaluationStatus {
  if (state.reaction && state.drawing_grade) return 'evaluated';
  if (state.reaction) return state.evaluated_at ? 'evaluated' : 'needs_grade';
  if (state.drawing_grade) return 'needs_reaction';
  return state.evaluated_at ? 'evaluated' : 'not_started';
}

/**
 * The evaluated_at a drawing should carry after a change.
 *
 * Both present: evaluated (keeping the first time). A drawing answered before
 * grades existed keeps its evaluated_at until a teacher clears its reaction or
 * grade, so re-saving an old review never sends it back to the list.
 */
export function nextEvaluatedAt(before: EvaluationState, after: Pick<EvaluationState, 'reaction' | 'drawing_grade'>, now: string): string | null {
  if (after.reaction && after.drawing_grade) return before.evaluated_at ?? now;
  const cleared = (before.reaction && !after.reaction) || (before.drawing_grade && !after.drawing_grade);
  return before.evaluated_at && !cleared ? before.evaluated_at : null;
}
