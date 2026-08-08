/**
 * The shape of a previous-year paper, as the wizard's PYQ step draws it.
 *
 * PURE. "Exam-faithful" is a promise that sitting the mock feels like sitting
 * the paper, and the two things that make it true are the section split and the
 * marking. The split is real data, counted off the questions. The marking is
 * not stored anywhere, so it comes from the published scheme below.
 *
 * That distinction is deliberate and is why `marksSource` is reported: a
 * section whose marking was assumed should be shown as an assumption, not as a
 * fact read out of the paper. A teacher can then correct it in step 4 rather
 * than discovering at results time that a mock deducted marks the real exam
 * would not have.
 */

export interface BlueprintSection {
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
 * JEE Paper 2 objective questions are +4 correct, −1 wrong. Drawing is marked
 * out of a much larger figure by a human and cannot be negatively marked, which
 * is why it is separated rather than averaged in.
 */
const SCHEME: Record<string, { objective: [number, number]; drawing: [number, number] }> = {
  JEE_PAPER_2: { objective: [4, 1], drawing: [50, 0] },
  NATA: { objective: [3, 0], drawing: [50, 0] },
};

const DEFAULT_SCHEME = { objective: [1, 0] as [number, number], drawing: [10, 0] as [number, number] };

/** Categories and formats that mean "a human marks a drawing", not "an option was ticked". */
function isDrawingSection(name: string): boolean {
  return /draw/i.test(name);
}

/** Title-cases a category slug the way the rest of the question bank does. */
export function sectionLabel(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Turn a category breakdown into the section list T2c renders.
 *
 * `breakdown` is what getPaperSectionBreakdown returns: category slug to count,
 * already falling back to question_format for questions carrying no category.
 *
 * Ordered by size, largest first, with ties broken on the name so two reads of
 * the same paper cannot present its sections in different orders.
 */
export function buildPaperBlueprint(
  breakdown: Record<string, number>,
  examType: string | null | undefined,
): PaperBlueprintResult {
  const scheme = SCHEME[String(examType || '')] ?? DEFAULT_SCHEME;

  const sections: BlueprintSection[] = Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(([slug, count]) => {
      const name = sectionLabel(slug);
      const [marks, negative] = isDrawingSection(name) ? scheme.drawing : scheme.objective;
      return { name, questionCount: count, marks, negativeMarks: negative };
    })
    .sort((a, b) => b.questionCount - a.questionCount || a.name.localeCompare(b.name));

  return {
    sections,
    totalQuestions: sections.reduce((sum, s) => sum + s.questionCount, 0),
    marksSource: 'scheme',
  };
}

/**
 * Per-question marks for composeTest, expanded from the blueprint.
 *
 * The order has to match the question order the caller composes with, so this
 * takes the questions and reads each one's section rather than assuming the
 * sections are contiguous. A paper interleaved by question number would
 * otherwise get a whole section's marking applied to the wrong questions.
 */
export function marksForQuestions(
  questions: Array<{ categories?: string[] | null; question_format?: string | null }>,
  blueprint: PaperBlueprintResult,
): { marks: number[]; negativeMarks: number[] } {
  const byName = new Map(blueprint.sections.map((s) => [s.name, s]));
  const marks: number[] = [];
  const negativeMarks: number[] = [];

  for (const q of questions) {
    const slug = q.categories?.[0] || q.question_format || 'OTHER';
    const section = byName.get(sectionLabel(slug));
    marks.push(section?.marks ?? 1);
    negativeMarks.push(section?.negativeMarks ?? 0);
  }
  return { marks, negativeMarks };
}
