/**
 * The shape of a previous-year paper, as the wizard's PYQ step draws it.
 *
 * The implementation moved to packages/database (queries/nexus/paper-marking.ts)
 * so that generatePaperMockTest, which lives in that package and cannot import
 * from an app, can finally use it. That was the reason marksForQuestions had no
 * call site for so long: a paper mock physically could not reach its own
 * marking scheme, so every imported paper marked 1 per question with no penalty.
 *
 * This file stays as the app's import path. Nothing that used it needs to change.
 */

export {
  buildPaperBlueprint,
  marksForQuestions,
  markingKeyFor,
  sectionLabel,
  sectionOrderFor,
  type BlueprintSection,
  type PaperBlueprintResult,
} from '@neram/database';
