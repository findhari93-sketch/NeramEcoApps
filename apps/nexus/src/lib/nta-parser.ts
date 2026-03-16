import type { QBQuestionFormat, NTAParsedQuestion, NTAParsedPaper } from '@neram/database';

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
export function parseNTAAnswerSheet(rawText: string): NTAParsedPaper {
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
    const { section, categories } = classifyQuestion(questionNumber, questionFormat);

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

  const sectionLabels: Record<string, string> = {
    math_mcq: 'Mathematics (MCQ)',
    math_numerical: 'Mathematics (Numerical)',
    aptitude: 'Aptitude Test',
    drawing: 'Drawing Test',
  };

  const sections = Array.from(sectionCounts.entries()).map(([key, count]) => ({
    name: sectionLabels[key] || key,
    count,
  }));

  return {
    questions,
    total: questions.length,
    sections,
    warnings,
  };
}

/**
 * Classify a question into section and categories based on position in JEE Paper 2.
 */
function classifyQuestion(
  questionNumber: number,
  format: QBQuestionFormat
): { section: NTAParsedQuestion['section']; categories: string[] } {
  if (questionNumber <= 20) {
    return { section: 'math_mcq', categories: ['mathematics'] };
  }
  if (questionNumber <= 25) {
    return { section: 'math_numerical', categories: ['mathematics'] };
  }
  if (questionNumber <= 75) {
    return { section: 'aptitude', categories: ['aptitude'] };
  }
  // Q76+
  return { section: 'drawing', categories: ['drawing'] };
}
