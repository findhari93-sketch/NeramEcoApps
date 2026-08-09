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

    // Determine section and categories based on question number
    // JEE Paper 2 (B.Arch) structure:
    //   Section A (Math MCQ): Q1-Q20
    //   Section B (Math Numerical): Q21-Q25
    //   Aptitude Test: Q26-Q75
    //   Drawing Test: Q76-Q77
    const { section, categories } = classifyQuestion(questionNumber, questionFormat, examType);

    questions.push({
      question_number: questionNumber,
      nta_question_id: ntaQuestionId,
      question_format: questionFormat,
      options,
      section,
      categories,
    });
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
 * Which section a question belongs to.
 *
 * This is the single definition of the guess. The same rule is reproduced in
 * SQL by 20260827090000_nexus_qb_question_sections.sql for the backfill, and
 * called again server-side when a teacher presses "Re-run the guess", so the
 * three can never drift.
 *
 * Priority order matters:
 *   1. A DRAWING_PROMPT is a drawing question wherever it sits. Format beats
 *      position, so a paper that numbers its drawing prompts differently still
 *      lands right.
 *   2. JEE Paper 2 has a published structure: Q1-20 maths MCQ, Q21-25 maths
 *      numerical, Q26-75 aptitude, Q76+ drawing.
 *   3. NATA's boundaries move between years, so guessing by position there
 *      would be confidently wrong. Fall back to the format alone and let the
 *      teacher correct it in the paper workspace. A visible wrong guess a
 *      teacher can fix beats an invisible one.
 *
 * Every guess is correctable per question, so none of this is load-bearing on
 * its own. What is load-bearing is that it is ONE rule in ONE place.
 */
export function classifyQuestion(
  questionNumber: number,
  format: QBQuestionFormat,
  examType: QBExamType = 'JEE_PAPER_2',
): { section: QBQuestionSection; section_order: number; categories: string[] } {
  const section = guessSection(questionNumber, format, examType);
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
): QBQuestionSection {
  if (format === 'DRAWING_PROMPT') return 'drawing';

  if (examType === 'JEE_PAPER_2') {
    if (questionNumber <= 20) return 'math_mcq';
    if (questionNumber <= 25) return 'math_numerical';
    if (questionNumber <= 75) return 'aptitude';
    return 'drawing';
  }

  // NATA and anything else: format only.
  return format === 'NUMERICAL' ? 'math_numerical' : 'aptitude';
}
