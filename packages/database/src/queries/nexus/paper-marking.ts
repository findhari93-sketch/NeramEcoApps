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
 * Where a set of per-question marks actually came from.
 *
 * The blueprint is a summary of sections and can only ever report 'scheme',
 * because it counts questions without reading them. marksForQuestions reads
 * every question, so it can tell the difference between a paper nobody has
 * stated the marking for and one that states it on every question. 'mixed' is
 * the honest answer for a half-filled paper, and it is the one worth showing a
 * teacher: it means some of these numbers are assumptions and some are not.
 */
export type MarksSource = 'scheme' | 'paper' | 'mixed';

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
 * The published scheme for an exam, for showing a teacher what the fallback is.
 *
 * Exported so a paper export can state the marking it would be given if no
 * question declares its own, rather than leaving a reader to guess why a
 * question with no marks_correct still ends up worth 4.
 */
export function schemeForExam(
  examType: string | null | undefined,
): { objective: [number, number]; drawing: [number, number] } {
  return SCHEME[String(examType || '')] ?? DEFAULT_SCHEME;
}

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
  const scheme = schemeForExam(examType);

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
 * A stated mark, or null when the question does not state one.
 *
 * PostgREST hands back a NUMERIC as a JSON number, but a hand-built row or an
 * imported JSON can carry a string, so this coerces. NaN and Infinity are
 * treated as unstated rather than propagated: a single bad value in an
 * uploaded file would otherwise produce a test with a NaN total that no
 * student could ever score against.
 */
function statedMark(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Per-question marks for composeTest.
 *
 * The order has to match the question order the caller composes with, so this
 * takes the questions and reads each one's section rather than assuming the
 * sections are contiguous. A paper interleaved by question number would
 * otherwise get a whole section's marking applied to the wrong questions.
 *
 * The question's own marks_correct/marks_negative win when set, and that is the
 * whole point of those columns: a paper whose marking does not match the
 * published scheme can now say so per question instead of being silently
 * marked as if it did. The stored section wins next, over categories[0]. That
 * matters: categories is a topic taxonomy a question can carry several of, so
 * retagging a question used to silently change what it was worth.
 *
 * Negatives are stored positive. composeTest normalises with Math.abs, so a
 * sign here would be applied twice and cancel.
 */
export function marksForQuestions(
  questions: Array<{
    section?: string | null;
    categories?: string[] | null;
    question_format?: string | null;
    marks_correct?: number | string | null;
    marks_negative?: number | string | null;
  }>,
  blueprint: PaperBlueprintResult,
): { marks: number[]; negativeMarks: number[]; marksSource: MarksSource } {
  const byKey = new Map(blueprint.sections.map((s) => [s.key, s]));
  const byName = new Map(blueprint.sections.map((s) => [s.name, s]));
  const marks: number[] = [];
  const negativeMarks: number[] = [];
  let stated = 0;

  for (const q of questions) {
    const key = markingKeyFor(q);
    const section = byKey.get(key) ?? byName.get(displayName(key));
    const own = statedMark(q.marks_correct);
    const ownNegative = statedMark(q.marks_negative);

    // marks_correct alone is enough to count as stated. A question worth 2 with
    // no deduction is a real marking scheme, and demanding both would have
    // silently sent it back to the scheme's -1.
    if (own !== null) stated += 1;

    marks.push(own ?? section?.marks ?? 1);
    negativeMarks.push(ownNegative ?? (own !== null ? 0 : (section?.negativeMarks ?? 0)));
  }

  const marksSource: MarksSource =
    stated === 0 ? 'scheme' : stated === questions.length ? 'paper' : 'mixed';

  return { marks, negativeMarks, marksSource };
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
