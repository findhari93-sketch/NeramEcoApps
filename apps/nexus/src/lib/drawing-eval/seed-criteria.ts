/**
 * The criteria each brief type is judged on, and the band wording behind them.
 *
 * Where these came from, and what is still missing:
 *
 * The CRITERIA are safe to seed here because Hari wrote them. They are the
 * headings of buildFeedbackPrompt (drawing-prompt-templates.ts), and the graded
 * history confirms every review actually uses them: across the 108 completed
 * reviews carrying real feedback, proportion appears in 108, composition in
 * 108, tone or shading in 107, line in 100, and a design principle in 79 of
 * the 2D ones. Perspective appears in 31, essentially all of them 3D, which is
 * why depth_perspective is on still_life only.
 *
 * The BAND DESCRIPTIONS are not seeded, and deliberately so. 97 of those same
 * 108 reviews still contain Gemini's "Overall Impression" heading, meaning the
 * prose is largely unedited model output pasted back from the manual workflow,
 * not Hari's own words. Sampled band-2 sheets carry glowing text. So the prose
 * cannot be mined for band wording without laundering generic art critique
 * straight back into the system, which is the exact failure the brief was
 * written to fix.
 *
 * What IS clean signal is the band Hari assigned, decided independently of the
 * pasted prose. That judgement lives in the anchor sheets, which is why the
 * model is asked to place a sheet relative to anchors rather than to score it
 * against these words. The band descriptions here are a tiebreaker and a label,
 * not the primary instrument. That is why a handful of TODOs does not make the
 * design unworkable, only inactive.
 *
 * activateBriefType() refuses while any band is still a placeholder, so the
 * feature cannot quietly run on TODO text.
 */

/** Marks a band description that still needs Hari's words. */
export const BAND_TODO = 'TODO';

export type BandMap = Record<'1' | '2' | '3' | '4' | '5', string>;

export interface SeedCriterion {
  key: string;
  title: string;
  /** Concrete, checkable statements. The model is told to cite these. */
  observableChecks: string[];
  bandDescriptions: BandMap;
  weight?: number;
}

export interface SeedBriefType {
  key: string;
  category: string;
  subType: string;
  title: string;
  description: string;
  criteria: SeedCriterion[];
}

/** Every band still needing Hari's wording. Replaced brief type by brief type. */
const TODO_BANDS: BandMap = {
  '1': BAND_TODO,
  '2': BAND_TODO,
  '3': BAND_TODO,
  '4': BAND_TODO,
  '5': BAND_TODO,
};

const COMPOSITION: SeedCriterion = {
  key: 'composition',
  title: 'Composition',
  observableChecks: [
    'The subject sits within the sheet with deliberate margins, not crowded into a corner or floating in empty space.',
    'There is one clear focal point rather than several competing ones.',
    'Objects overlap or are grouped to create depth, instead of being spaced evenly like a catalogue.',
    'The arrangement is grounded, with a surface or base line rather than the subject hanging in white space.',
  ],
  bandDescriptions: { ...TODO_BANDS },
};

const PROPORTION: SeedCriterion = {
  key: 'proportion',
  title: 'Proportion accuracy',
  observableChecks: [
    'Objects are correctly sized relative to one another.',
    'Each object is internally consistent: a circular rim reads as an ellipse of the right width for its viewing angle.',
    'Repeated elements keep a consistent size as they recede.',
    'Symmetrical objects are symmetrical about their own axis.',
  ],
  bandDescriptions: { ...TODO_BANDS },
};

const TONAL_QUALITY: SeedCriterion = {
  key: 'tonal_quality',
  title: 'Shading and tonal quality',
  observableChecks: [
    'There is a readable range from deep dark to clean light, not a uniform mid grey.',
    'A single consistent light source explains every shadow in the drawing.',
    'Pencil pressure is controlled, so gradients read as smooth rather than scratchy or patchy.',
    'Cast shadows and form shadows are distinguished from each other.',
  ],
  bandDescriptions: { ...TODO_BANDS },
};

const LINE_QUALITY: SeedCriterion = {
  key: 'line_quality',
  title: 'Line quality',
  observableChecks: [
    'Outlines are confident single strokes rather than repeatedly sketched over.',
    'Construction lines are either cleanly erased or deliberately kept as part of the drawing.',
    'Line weight varies purposefully, heavier on near or shadowed edges.',
    'Straight edges are straight and curves are continuous, without visible wobble.',
  ],
  bandDescriptions: { ...TODO_BANDS },
};

const DESIGN_PRINCIPLE: SeedCriterion = {
  key: 'design_principle',
  title: 'Design principle',
  observableChecks: [
    'A named principle (balance, rhythm, emphasis, hierarchy, proportion) is visibly driving the layout.',
    'Negative space is used actively rather than being whatever is left over.',
    'The composition avoids sitting dead centre unless symmetry is the stated intent.',
    'Any colour or tone constraint set by the brief is respected throughout.',
  ],
  bandDescriptions: { ...TODO_BANDS },
};

const DEPTH_PERSPECTIVE: SeedCriterion = {
  key: 'depth_perspective',
  title: 'Depth and perspective',
  observableChecks: [
    'Receding edges converge consistently towards a coherent vanishing point.',
    'The eye level is consistent across every object in the scene.',
    'Ellipses open and close correctly according to their height relative to eye level.',
    'Overlap, scale and tone work together so nearer objects read as nearer.',
  ],
  bandDescriptions: { ...TODO_BANDS },
};

/**
 * The three brief types to start with, chosen by graded depth in production:
 * still_life 35 graded across 19 questions, geometric_shapes 31 across 11,
 * logo 10 across 3. Together 76 of the 129 graded sheets.
 */
export const SEED_BRIEF_TYPES: SeedBriefType[] = [
  {
    key: '3d_composition.still_life',
    category: '3d_composition',
    subType: 'still_life',
    title: 'Still life',
    description:
      'An arrangement of everyday objects drawn from observation, judged on form, depth and tonal control.',
    criteria: [COMPOSITION, PROPORTION, DEPTH_PERSPECTIVE, TONAL_QUALITY, LINE_QUALITY],
  },
  {
    key: '2d_composition.geometric_shapes',
    category: '2d_composition',
    subType: 'geometric_shapes',
    title: 'Geometric composition',
    description:
      'A flat composition built from geometric elements under a stated colour or principle constraint.',
    criteria: [COMPOSITION, PROPORTION, DESIGN_PRINCIPLE, TONAL_QUALITY, LINE_QUALITY],
  },
  {
    key: '2d_composition.logo',
    category: '2d_composition',
    subType: 'logo',
    title: 'Logo design',
    description:
      'A mark judged on legibility at size, balance, and the discipline of its construction.',
    criteria: [COMPOSITION, PROPORTION, DESIGN_PRINCIPLE, TONAL_QUALITY, LINE_QUALITY],
  },
];

/** Bands still carrying a placeholder, as a sorted list of band numbers. */
export function placeholderBands(bands: BandMap): string[] {
  return (['1', '2', '3', '4', '5'] as const).filter(
    (b) => !bands[b] || bands[b].trim() === '' || bands[b].trim().startsWith(BAND_TODO),
  );
}

/** True when every criterion has all five bands written in real words. */
export function isReadyToActivate(criteria: Array<{ bandDescriptions: BandMap }>): boolean {
  return criteria.length > 0 && criteria.every((c) => placeholderBands(c.bandDescriptions).length === 0);
}

/** Human-readable account of what is still missing, for the API to return. */
export function describeMissingBands(
  criteria: Array<{ key: string; bandDescriptions: BandMap }>,
): string[] {
  const gaps: string[] = [];
  for (const c of criteria) {
    const missing = placeholderBands(c.bandDescriptions);
    if (missing.length > 0) {
      gaps.push(`${c.key}: bands ${missing.join(', ')} still need wording`);
    }
  }
  return gaps;
}

export function seedBriefTypeByKey(key: string): SeedBriefType | undefined {
  return SEED_BRIEF_TYPES.find((b) => b.key === key);
}
