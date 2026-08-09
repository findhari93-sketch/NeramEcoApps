/**
 * The shape and the marking of a previous-year paper.
 *
 * PURE, and deliberately in packages/database rather than in the Nexus app:
 * generatePaperMockTest lives here and could not import it from an app, which
 * is the whole reason marksForQuestions sat unused for so long. The app's
 * lib/paper-blueprint.ts now re-exports this module, so the wizard and its
 * tests are unaffected.
 *
 * "Exam-faithful" is a promise that sitting the mock feels like sitting the
 * paper, and the two things that make it true are the section split and the
 * marking. The split is real data, counted off the questions. The marking is
 * not stored anywhere, so it comes from the published scheme below.
 *
 * That distinction is why `marksSource` is reported: a section whose marking
 * was assumed should be shown as an assumption, not as a fact read off the
 * paper. A teacher can then correct it rather than discovering at results time
 * that a mock deducted marks the real exam would not have.
 */

import { QB_SECTION_ORDER, isQBQuestionSection, qbSectionLabel } from '../../types';

export interface BlueprintSection {
  /**
   * The breakdown key this section came from: a QBQuestionSection when the
   * paper has been sectioned, otherwise a category slug or a question format.
   * Marks are looked up by this, never by the display name, so relabelling a
   * section for humans cannot change what it is worth.
   */
  key: string;
  name: string;
  questionCount: number;
  marks: number;
  negativeMarks: number;
}

export interface PaperBlueprintResult {
  sections: BlueprintSection[];
  totalQuestions: number;
  /** 'scheme' when taken from the table below, meaning nobody has confirmed it for this paper. */
  marksSource: 'scheme';
}

/**
 * Published marking, by exam and by what kind of question it is.
 *
 * JEE Paper 2 objective questions are +4 correct, -1 wrong. Drawing is marked
 * out of a much larger figure by a human and cannot be negatively marked, which
 * is why it is separated rather than averaged in.
 */
const SCHEME: Record<string, { objective: [number, number]; drawing: [number, number] }> = {
  JEE_PAPER_2: { objective: [4, 1], drawing: [50, 0] },
  NATA: { objective: [3, 0], drawing: [50, 0] },
};

const DEFAULT_SCHEME = { objective: [1, 0] as [number, number], drawing: [10, 0] as [number, number] };

/**
 * Does a human mark this, rather than a machine checking a ticked option?
 *
 * Checks the key first, because 'drawing' is a section value and an exact match
 * beats a regex. The name regex stays as the fallback for papers described by
 * free-text category slugs, which is most of the older ones.
 */
function isDrawingKey(key: string, name: string): boolean {
  if (key === 'drawing' || key === 'DRAWING_PROMPT') return true;
  return /draw/i.test(name);
}

/** Title-cases a category slug the way the rest of the question bank does. */
export function sectionLabel(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A known section gets its proper label; anything else gets title-cased. */
function displayName(key: string): string {
  return isQBQuestionSection(key) ? qbSectionLabel(key) : sectionLabel(key);
}

/**
 * Turn a section breakdown into the section list the wizard renders.
 *
 * `breakdown` is what getPaperSectionBreakdown returns: a key to a count, now
 * preferring the section stored on each question and still falling back to a
 * category slug or a question format for anything unsectioned.
 *
 * Ordered by size, largest first, with ties broken on the name so two reads of
 * the same paper cannot present its sections in different orders. This is a
 * summary for a human choosing a paper, not the order it is sat in: the sitting
 * order comes from section_order via pickSectionedDraw.
 */
export function buildPaperBlueprint(
  breakdown: Record<string, number>,
  examType: string | null | undefined,
): PaperBlueprintResult {
  const scheme = SCHEME[String(examType || '')] ?? DEFAULT_SCHEME;

  const sections: BlueprintSection[] = Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const name = displayName(key);
      const [marks, negative] = isDrawingKey(key, name) ? scheme.drawing : scheme.objective;
      return { key, name, questionCount: count, marks, negativeMarks: negative };
    })
    .sort((a, b) => b.questionCount - a.questionCount || a.name.localeCompare(b.name));

  return {
    sections,
    totalQuestions: sections.reduce((sum, s) => sum + s.questionCount, 0),
    marksSource: 'scheme',
  };
}

/** What a question counts as for marking, most specific source first. */
export function markingKeyFor(q: {
  section?: string | null;
  categories?: string[] | null;
  question_format?: string | null;
}): string {
  return q.section || q.categories?.[0] || q.question_format || 'OTHER';
}

/**
 * Per-question marks for composeTest, expanded from the blueprint.
 *
 * The order has to match the question order the caller composes with, so this
 * takes the questions and reads each one's section rather than assuming the
 * sections are contiguous. A paper interleaved by question number would
 * otherwise get a whole section's marking applied to the wrong questions.
 *
 * The stored section wins over categories[0]. That matters: categories is a
 * topic taxonomy a question can carry several of, so retagging a question used
 * to silently change what it was worth.
 */
export function marksForQuestions(
  questions: Array<{
    section?: string | null;
    categories?: string[] | null;
    question_format?: string | null;
  }>,
  blueprint: PaperBlueprintResult,
): { marks: number[]; negativeMarks: number[] } {
  const byKey = new Map(blueprint.sections.map((s) => [s.key, s]));
  const byName = new Map(blueprint.sections.map((s) => [s.name, s]));
  const marks: number[] = [];
  const negativeMarks: number[] = [];

  for (const q of questions) {
    const key = markingKeyFor(q);
    const section = byKey.get(key) ?? byName.get(displayName(key));
    marks.push(section?.marks ?? 1);
    negativeMarks.push(section?.negativeMarks ?? 0);
  }
  return { marks, negativeMarks };
}

/**
 * Section order for a question, for laying a paper out in the order it is sat.
 *
 * Unknown sections sort last rather than first, so an unclassified question
 * lands at the end of the paper where it is visible instead of silently
 * opening it.
 */
export function sectionOrderFor(section: string | null | undefined): number {
  if (section && isQBQuestionSection(section)) return QB_SECTION_ORDER[section];
  return 99;
}
