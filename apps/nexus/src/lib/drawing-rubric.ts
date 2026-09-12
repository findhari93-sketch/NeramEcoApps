/**
 * What gets judged on a drawing, and how the parts make a whole.
 *
 * Five anonymous stars carried the entire judgement before this. Nothing was
 * comparable between two students or between the same student in October and in
 * March, and a score could not be defended to a parent beyond "it felt like a 3".
 *
 * THE SHAPE IS NOT INVENTED. It is read off an audit of 108 completed reviews:
 * proportion appeared in 108, composition in 108, tone or shading in 107, line
 * in 100. Those four are near-universal. Design principle appeared in 79, all of
 * them 2D sheets, and perspective in 31, essentially all of them 3D. So the
 * rubric is FOUR FIXED plus ONE the brief decides, which is also the ceiling the
 * founder asked for.
 *
 * Two things are deliberately NOT scored. Artistic or creative value is the
 * least anchorable thing on a sheet and scoring it would poison the training
 * signal worse than any other single choice; it stays the reaction and the
 * gallery toggle, which is what those already are. Cleanliness of the paper is a
 * presentation flag, not a drawing skill being taught, so it belongs in triage.
 *
 * Because only the fifth criterion depends on the brief, tagging an assignment
 * with its brief type LATER keeps four of five scores already given. That is
 * what makes the brief type a cheap, late, reversible decision rather than
 * something that has to be right before anyone has seen a submission.
 *
 * The keys match `supabase/migrations/20260909090100_drawing_ai_evaluation_seed.sql`
 * exactly, so a manual score and a model's score are about the same criterion.
 */

export type Band = 1 | 2 | 3 | 4 | 5;

export interface RubricCriterion {
  key: string;
  title: string;
  /** One line under the title, so the teacher is not guessing what it covers. */
  hint: string;
}

/** Judged on nearly every sheet, whatever the brief. */
export const SHARED_CRITERIA: readonly RubricCriterion[] = [
  {
    key: 'composition',
    title: 'Composition',
    hint: 'How the work sits on the sheet, and whether it reads as one arrangement',
  },
  {
    key: 'proportion',
    title: 'Proportion and scale',
    hint: 'Sizes right against each other, and each object consistent with itself',
  },
  {
    key: 'tonal_quality',
    title: 'Tonal quality',
    hint: 'Range, gradation and a single light source. Colour handling on a coloured sheet',
  },
  {
    key: 'line_quality',
    title: 'Line quality',
    hint: 'Confident single strokes, purposeful weight, clean curves',
  },
] as const;

/**
 * The fifth criterion, chosen by the brief.
 *
 * Keyed on `drawing_brief_type.key`. Anything not listed simply gets the shared
 * four, which is the honest answer for the assignment drawings that resolve to
 * no brief type at all.
 */
export const BRIEF_CRITERION: Record<string, RubricCriterion> = {
  '3d_composition.still_life': {
    key: 'depth_perspective',
    title: 'Depth and perspective',
    hint: 'Convergence, a consistent eye level, and nearer things reading as nearer',
  },
  '3d_composition.perspective_construction': {
    key: 'depth_perspective',
    title: 'Depth and perspective',
    hint: 'Convergence, a consistent eye level, and nearer things reading as nearer',
  },
  '2d_composition.geometric_shapes': {
    key: 'design_principle',
    title: 'Design principle',
    hint: 'A named principle driving the layout, and negative space used actively',
  },
  '2d_composition.logo': {
    key: 'design_principle',
    title: 'Design principle',
    hint: 'A named principle driving the layout, and negative space used actively',
  },
};

/** The rows to show for one brief. Never more than five. */
export function criteriaForBrief(briefKey: string | null | undefined): RubricCriterion[] {
  const extra = briefKey ? BRIEF_CRITERION[briefKey] : undefined;
  return extra ? [...SHARED_CRITERIA, extra] : [...SHARED_CRITERIA];
}

export type BandMap = Record<string, Band | undefined>;

/** Only a real band counts. A missing key and a 0 both mean "not scored yet". */
const scored = (bands: BandMap, criteria: RubricCriterion[]): Band[] =>
  criteria
    .map((c) => bands[c.key])
    .filter((b): b is Band => typeof b === 'number' && b >= 1 && b <= 5);

export function scoredCount(bands: BandMap, criteria: RubricCriterion[]): number {
  return scored(bands, criteria).length;
}

export function isFullyScored(bands: BandMap, criteria: RubricCriterion[]): boolean {
  return scoredCount(bands, criteria) === criteria.length;
}

/**
 * The headline number, out of 5.
 *
 * A plain mean of what has been scored, so the figure is honest while the
 * teacher is still part-way down the list rather than pretending the unscored
 * rows are zeros. Criteria this brief does not use are ignored even if a score
 * for one is lying around from before the brief was retagged.
 *
 * One decimal place, because 2.8 says something a teacher can act on and
 * 2.7777777 says the same thing less clearly.
 */
export function overallFromBands(bands: BandMap, criteria: RubricCriterion[]): number | null {
  const values = scored(bands, criteria);
  if (values.length === 0) return null;
  const mean = values.reduce((sum, b) => sum + b, 0) / values.length;
  return Math.round(mean * 10) / 10;
}

/**
 * The overall as the old one-to-five star field.
 *
 * `drawing_submissions.tutor_rating` is read by the review queue, the gallery,
 * the assignment roster and the student's own page. The rubric has to keep
 * feeding it or all four go dark, so every rubric save still writes a star.
 */
export function overallToStars(overall: number | null): Band | null {
  if (overall == null || !Number.isFinite(overall)) return null;
  const rounded = Math.round(overall);
  return Math.min(5, Math.max(1, rounded)) as Band;
}
