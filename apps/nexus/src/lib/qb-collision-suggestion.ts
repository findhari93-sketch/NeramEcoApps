import {
  QB_CATEGORY_GROUP_LABELS,
  type QBCategory,
  type QBQuestionFormat,
  type QBQuestionSection,
} from '@neram/database';
import { contentSignal } from './qb-section-inference';

export interface QBCollisionSuggestionInput {
  question_format: QBQuestionFormat;
  question_text: string | null;
  categories: string[];
}

/**
 * Which QB_CATEGORY_GROUP_LABELS groups belong to which paper section.
 *
 * Deliberately reuses the taxonomy's existing group labels rather than
 * hand-listing every QBCategory a second time: QB_CATEGORY_GROUP_LABELS
 * already partitions every subcategory into exactly these groups for the
 * authoring UI, and a second, independent list here would drift from it the
 * first time a category is re-parented.
 */
const MATH_GROUPS = new Set([
  'Algebra',
  'Coordinate Geometry',
  'Calculus',
  'Trigonometry',
  'Vectors & 3D Geometry',
  'Probability & Statistics',
]);
const APTITUDE_GROUPS = new Set(['NATA Topics', 'Aptitude Topics']);

/**
 * Suggest which section a question actually belongs to, for one candidate in
 * a section/number collision.
 *
 * Signals in priority order:
 *   1. question_format vetoes first, same rule as inferPaperSections: a
 *      DRAWING_PROMPT is drawing, a NUMERICAL is maths numerical, wherever it
 *      sits.
 *   2. categories[], which the investigation that produced this tool found to
 *      be reliably correct even on rows whose `section` column was wrong. The
 *      broad categories (mathematics/aptitude/drawing) are checked directly;
 *      every other category is resolved through the group it already belongs
 *      to in the shared taxonomy.
 *   3. contentSignal(), the same LaTeX/vocabulary classifier
 *      inferPaperSections uses, run on this one question rather than assuming
 *      a paper-wide layout.
 *
 * Returns null when none of the three gives a usable answer, so the caller
 * shows "no suggestion" rather than a confident wrong guess.
 */
export function suggestSection(question: QBCollisionSuggestionInput): QBQuestionSection | null {
  if (question.question_format === 'DRAWING_PROMPT') return 'drawing';
  if (question.question_format === 'NUMERICAL') return 'math_numerical';

  for (const cat of question.categories) {
    if (cat === 'mathematics') return 'math_mcq';
    if (cat === 'aptitude') return 'aptitude';
    if (cat === 'drawing') return 'drawing';

    const group = QB_CATEGORY_GROUP_LABELS[cat as QBCategory];
    if (group && MATH_GROUPS.has(group)) return 'math_mcq';
    if (group && APTITUDE_GROUPS.has(group)) return 'aptitude';
  }

  const signal = contentSignal({
    id: '',
    question_number: null,
    question_format: question.question_format,
    question_text: question.question_text,
  });
  if (signal === 1) return 'math_mcq';
  if (signal === -1) return 'aptitude';

  return null;
}
