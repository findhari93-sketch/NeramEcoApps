import {
  QB_SECTION_LABELS,
  QB_SECTION_ORDER,
  type QBExamType,
  type QBQuestionFormat,
  type QBQuestionSection,
  type NTAParsedQuestion,
  type NTAParsedPaper,
} from '@neram/database';

/**
 * Parse pasted NTA answer sheet text into structured question data.
 *
 * NTA answer sheet format per question:
 *   Question Type : MCQ | SA | SUBJECTIVE
 *   Question ID : 4951349335
 *   Option 1 : 49513493351
 *   Option 2 : 49513493352
 *   Option 3 : 49513493353
 *   Option 4 : 49513493354
 *   Status : Answered | Not Answered | Marked For Review | ...
 *   Chosen Option : 49513493352 | -- (if not answered)
 *
 * CRITICAL: "Chosen Option" is the STUDENT's response, NOT the correct answer.
 * We parse it but explicitly DISCARD it.
 */
export function parseNTAAnswerSheet(
  rawText: string,
  examType: QBExamType = 'JEE_PAPER_2',
): NTAParsedPaper {
  const warnings: string[] = [];
  const questions: NTAParsedQuestion[] = [];

  // Normalize line endings
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into question blocks by looking for "Question Type" pattern
  // Each question starts with "Question Type"
  const blocks = text.split(/(?=Question\s*Type\s*:)/i).filter((b) => b.trim());

  if (blocks.length === 0) {
    warnings.push('No questions found. Make sure you pasted the NTA answer sheet text.');
    return { questions: [], total: 0, sections: [], warnings };
  }

  let questionNumber = 0;

  for (const block of blocks) {
    questionNumber++;
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

    // Extract fields using key:value pattern
    const fields = new Map<string, string>();
    for (const line of lines) {
      const match = line.match(/^(.+?)\s*:\s*(.+)$/);
      if (match) {
        fields.set(match[1].trim().toLowerCase(), match[2].trim());
      }
    }

    // Question Type
    const rawType = fields.get('question type') || '';
    let questionFormat: QBQuestionFormat;
    if (/^mcq$/i.test(rawType)) {
      questionFormat = 'MCQ';
    } else if (/^sa$/i.test(rawType) || /^num/i.test(rawType) || /^short/i.test(rawType)) {
      questionFormat = 'NUMERICAL';
    } else if (/^subj/i.test(rawType)) {
      questionFormat = 'DRAWING_PROMPT';
    } else {
      questionFormat = 'MCQ'; // Default
      if (rawType) {
        warnings.push(`Q${questionNumber}: Unknown type "${rawType}", defaulting to MCQ`);
      }
    }

    // Question ID
    const ntaQuestionId = fields.get('question id') || '';
    if (!ntaQuestionId) {
      warnings.push(`Q${questionNumber}: Missing Question ID`);
    }

    // Options (for MCQs)
    const options: { nta_id: string }[] = [];
    if (questionFormat === 'MCQ') {
      for (let i = 1; i <= 4; i++) {
        const optVal = fields.get(`option ${i}`);
        if (optVal && optVal !== '--') {
          options.push({ nta_id: optVal });
        }
      }
      if (options.length === 0) {
        warnings.push(`Q${questionNumber}: MCQ with no options found`);
      }
    }

    questions.push({
      question_number: questionNumber,
      nta_question_id: ntaQuestionId,
      question_format: questionFormat,
      options,
      // Filled in below. Sections cannot be decided inside this loop because
      // which layout the paper follows depends on how many questions it turns
      // out to have, and we do not know that until the loop ends.
      section: 'aptitude',
      categories: [],
    });
  }

  // Sections, now that the paper's length is known.
  const total = questions.length;
  for (const q of questions) {
    const { section, categories } = classifyQuestion(
      q.question_number,
      q.question_format,
      examType,
      total,
    );
    q.section = section;
    q.categories = categories;
  }

  if (examType === 'JEE_PAPER_2' && !isKnownJEEPaper2Layout(total)) {
    warnings.push(
      `This paper has ${total} questions, which does not match a JEE Paper 2 layout we know. ` +
        `Maths and aptitude questions have all been put in Aptitude. Open the paper and use ` +
        `"Work out the sections" to fix them, or set them yourself.`,
    );
  }

  // Build section summary
  const sectionCounts = new Map<string, number>();
  for (const q of questions) {
    sectionCounts.set(q.section, (sectionCounts.get(q.section) || 0) + 1);
  }

  const sections = Array.from(sectionCounts.entries())
    .sort((a, b) => (SECTION_ORDER_OF[a[0]] ?? 99) - (SECTION_ORDER_OF[b[0]] ?? 99))
    .map(([key, count]) => ({
      name: QB_SECTION_LABELS[key as QBQuestionSection] || key,
      count,
    }));

  return {
    questions,
    total: questions.length,
    sections,
    warnings,
  };
}

const SECTION_ORDER_OF: Record<string, number> = QB_SECTION_ORDER;

/** The broad topic slug that goes into categories[] for each section. */
const SECTION_CATEGORY: Record<QBQuestionSection, string> = {
  math_mcq: 'mathematics',
  math_numerical: 'mathematics',
  aptitude: 'aptitude',
  drawing: 'drawing',
};

/**
 * Where each JEE Paper 2 layout puts its section boundaries, keyed by how many
 * questions the paper has.
 *
 * The layout has been rewritten several times. Assuming one of them applies to
 * all of them is what put fifteen aptitude MCQs of the 92-question 2006 paper
 * into the drawing section, where they are marked +50/0 and never auto-graded.
 * `mathEnd` is the last maths question, `aptitudeEnd` the last aptitude one;
 * everything after is drawing.
 */
const JEE_PAPER_2_LAYOUTS: Record<number, { mathEnd: number; aptitudeEnd: number }> = {
  // 2006-era AIEEE B.Arch: maths 40, aptitude 50, drawing 2.
  92: { mathEnd: 40, aptitudeEnd: 90 },
  // 2014-2018 and 2021-onwards: maths 30, aptitude 50, drawing 2.
  82: { mathEnd: 30, aptitudeEnd: 80 },
  // 2019-2020: maths 25 (20 MCQ + 5 numerical), aptitude 50, drawing 2.
  77: { mathEnd: 25, aptitudeEnd: 75 },
};

/** Do we recognise a paper of this length, or are we about to guess blindly? */
export function isKnownJEEPaper2Layout(totalQuestions: number): boolean {
  return totalQuestions in JEE_PAPER_2_LAYOUTS;
}

/**
 * Which section a question belongs to, knowing only its number and format.
 *
 * This is the guess used by the paste path, where an NTA answer sheet gives us
 * question IDs and nothing to read. When the question text IS available, prefer
 * inferPaperSections in qb-section-inference.ts, which reads the questions
 * instead of assuming a layout.
 *
 * Priority order matters:
 *   1. Format decides whatever it can. A DRAWING_PROMPT is drawing wherever it
 *      sits and a NUMERICAL is maths-numerical wherever it sits. Just as
 *      importantly the converse holds: a four-option MCQ is NEVER put in
 *      drawing or maths-numerical, because it cannot be either. That veto
 *      alone would have prevented the mislabelling above.
 *   2. Position, but only against a layout we recognise from the paper's
 *      length. `totalQuestions` is what makes that safe.
 *   3. Otherwise format alone. NATA's boundaries move between years and an
 *      unrecognised JEE paper is a layout we have not seen, so guessing by
 *      position there would be confidently wrong. A visible wrong guess a
 *      teacher can fix beats an invisible one.
 */
export function classifyQuestion(
  questionNumber: number,
  format: QBQuestionFormat,
  examType: QBExamType = 'JEE_PAPER_2',
  totalQuestions?: number,
): { section: QBQuestionSection; section_order: number; categories: string[] } {
  const section = guessSection(questionNumber, format, examType, totalQuestions);
  return {
    section,
    section_order: QB_SECTION_ORDER[section],
    categories: [SECTION_CATEGORY[section]],
  };
}

function guessSection(
  questionNumber: number,
  format: QBQuestionFormat,
  examType: QBExamType,
  totalQuestions?: number,
): QBQuestionSection {
  // 1. Format first, both ways.
  if (format === 'DRAWING_PROMPT') return 'drawing';
  if (format === 'NUMERICAL') return 'math_numerical';

  // 2. Position, only against a layout this paper's length matches.
  const layout = examType === 'JEE_PAPER_2' && totalQuestions
    ? JEE_PAPER_2_LAYOUTS[totalQuestions]
    : undefined;
  if (layout) {
    if (questionNumber <= layout.mathEnd) return 'math_mcq';
    if (questionNumber <= layout.aptitudeEnd) return 'aptitude';
    // Past the aptitude block, but this is an MCQ, so it cannot be drawing.
    // The paper is numbered differently from what we assumed; aptitude is the
    // section it is most likely to belong to and the one that marks it +4/-1.
    return 'aptitude';
  }

  // 3. Unrecognised layout: format alone.
  return 'aptitude';
}
