/**
 * Observable checks for drafting WITHOUT reference sheets.
 *
 * Copied word for word from the seed migrations
 * (20260909090100_drawing_ai_evaluation_seed.sql and
 * 20260914110200_drawing_brief_assignment.sql), which hold the checks Hari
 * wrote for every criterion the rubric panel can show. They live in code as
 * well because the drafts that most need them are the assignment drawings
 * with no brief type, and those have no drawing_criterion rows to read.
 *
 * Keyed on the same criterion keys as lib/drawing-rubric.ts. A key added there
 * without checks here is caught by the test beside this file.
 */

export const GENERIC_OBSERVABLE_CHECKS: Record<string, readonly string[]> = {
  composition: [
    'The subject sits within the sheet with deliberate margins, not crowded into a corner or floating in empty space.',
    'There is one clear focal point rather than several competing ones.',
    'Objects overlap or are grouped to create depth, instead of being spaced evenly like a catalogue.',
    'The arrangement is grounded, with a surface or base line rather than the subject hanging in white space.',
  ],
  proportion: [
    'Objects are correctly sized relative to one another.',
    'Each object is internally consistent: a circular rim reads as an ellipse of the right width for its viewing angle.',
    'Repeated elements keep a consistent size as they recede.',
    'Symmetrical objects are symmetrical about their own axis.',
  ],
  tonal_quality: [
    'There is a readable range from deep dark to clean light, not a uniform mid grey.',
    'A single consistent light source explains every shadow in the drawing.',
    'Pencil pressure is controlled, so gradients read as smooth rather than scratchy or patchy.',
    'Cast shadows and form shadows are distinguished from each other.',
  ],
  line_quality: [
    'Outlines are confident single strokes rather than repeatedly sketched over.',
    'Construction lines are either cleanly erased or deliberately kept as part of the drawing.',
    'Line weight varies purposefully, heavier on near or shadowed edges.',
    'Straight edges are straight and curves are continuous, without visible wobble.',
  ],
  depth_perspective: [
    'Receding edges converge consistently towards a coherent vanishing point.',
    'The eye level is consistent across every object in the scene.',
    'Ellipses open and close correctly according to their height relative to eye level.',
    'Overlap, scale and tone work together so nearer objects read as nearer.',
  ],
  design_principle: [
    'A named principle (balance, rhythm, emphasis, hierarchy, proportion) is visibly driving the layout.',
    'Negative space is used actively rather than being whatever is left over.',
    'The composition avoids sitting dead centre unless symmetry is the stated intent.',
    'Any colour or tone constraint set by the brief is respected throughout.',
  ],
};

export function genericChecksFor(key: string): string[] {
  return [...(GENERIC_OBSERVABLE_CHECKS[key] ?? [])];
}
