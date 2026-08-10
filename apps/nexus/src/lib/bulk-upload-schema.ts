import type { QBQuestionFormat } from '@neram/database';

// ============================================
// Upload method tabs
// ============================================

export type UploadMethod = 'paste' | 'pdf' | 'json';

export const UPLOAD_METHODS: { id: UploadMethod; label: string; description: string }[] = [
  { id: 'paste', label: 'Paste Text', description: 'Copy & paste NTA answer sheet text' },
  { id: 'pdf', label: 'Upload PDF', description: 'Upload NTA answer sheet PDF file' },
  { id: 'json', label: 'Upload JSON', description: 'Upload JSON from AI tools (Gemini, Claude)' },
];

// ============================================
// Image state for review panel
// ============================================

export interface ImageState {
  /** Display URL — either a blob URL for local preview or a Supabase storage URL after upload */
  url: string;
  /** The raw file if not yet uploaded */
  file?: File;
  /** True once uploaded to Supabase storage */
  uploaded: boolean;
  /** Supabase storage path (set after upload) */
  storagePath?: string;
}

// ============================================
// ReviewQuestion — canonical shape used in the review panel
// All upload methods (paste, PDF, JSON) convert to this format.
// ============================================

export interface ReviewQuestionOption {
  /** Option label: A, B, C, D */
  label: string;
  /** Option text (may be empty for image-only options) */
  text: string;
  /** Option text in Hindi */
  text_hi?: string;
  /** Option image */
  image?: ImageState;
  /** NTA option ID (from answer sheet) */
  nta_id?: string;
}

export interface ReviewQuestion {
  /** Client-side unique ID for React keys and editing */
  _clientId: string;
  /** Question number in the paper (1-indexed) */
  question_number: number;
  /** Question text extracted from PDF or JSON */
  question_text: string;
  /** Question text in Hindi (optional, for bilingual papers) */
  question_text_hi?: string;
  /** Question image (diagram, figure, etc.) */
  question_image?: ImageState;
  /** Question format */
  question_format: QBQuestionFormat;
  /** MCQ options (4 for MCQ, empty for others) */
  options: ReviewQuestionOption[];
  /** NTA question ID from answer sheet */
  nta_question_id: string;
  /** Section key: math_mcq, math_numerical, aptitude, drawing */
  section: 'math_mcq' | 'math_numerical' | 'aptitude' | 'drawing';
  /** Category tags */
  categories: string[];
  /** Correct answer — filled later from answer key */
  correct_answer?: string;
  /** Numerical answer tolerance */
  answer_tolerance?: number;
  /** Marks for correct answer */
  marks_correct?: number;
  /** Negative marks for wrong answer */
  marks_negative?: number;
  /** Solution video URL (YouTube unlisted or SharePoint) */
  solution_video_url?: string;
  /** Brief explanation of the solution */
  explanation_brief?: string;
  /** Detailed step-by-step explanation */
  explanation_detailed?: string;
  /** Has been modified by user in review panel */
  _modified?: boolean;
  /** Validation errors for this question */
  _errors?: string[];
  // --- Drawing-specific fields (for DRAWING_PROMPT format) ---
  drawing_objects?: string[];
  drawing_color_constraint?: string;
  drawing_design_principle?: string;
  drawing_sub_type?: '2d_composition' | '3d_composition' | 'kit_sculpture';
}

// ============================================
// JSON Upload Schema — what users generate from AI tools
// ============================================

export interface BulkUploadJSON {
  /** Schema version for forward compatibility */
  schema_version: '1.0';
  /** Paper metadata extracted from the PDF */
  paper: {
    exam_name: string;
    exam_date?: string;
    exam_time?: string;
    subject?: string;
    total_questions: number;
  };
  /** Sections in the paper */
  sections: BulkUploadSection[];
}

export interface BulkUploadSection {
  name: string;
  section_key: 'math_mcq' | 'math_numerical' | 'aptitude' | 'drawing';
  question_count: number;
  questions: BulkUploadQuestion[];
}

export interface BulkUploadQuestion {
  question_number: number;
  question_text: string;
  /** Question text in Hindi (for bilingual papers) */
  question_text_hi?: string;
  /** Base64 encoded image or external URL */
  question_image?: string;
  question_format: 'MCQ' | 'NUMERICAL' | 'DRAWING_PROMPT' | 'IMAGE_BASED';
  nta_question_id?: string;
  options?: {
    label: string;
    text: string;
    text_hi?: string;
    image?: string;
    nta_id?: string;
  }[];
  /**
   * The answer, when this file carries it.
   *
   * Optional, because the NTA answer key is usually a second PDF that arrives
   * later and still has its own paste screen. Including it here collapses the
   * import from three screens to one. For an MCQ give the option label ("A" or
   * "a"); for a NUMERICAL give the value.
   */
  correct_answer?: string;
  /** Accepted range either side of a NUMERICAL answer. */
  answer_tolerance?: number;
  marks_correct?: number;
  marks_negative?: number;
  categories?: string[];
  /** Solution video URL (YouTube unlisted or SharePoint) */
  solution_video_url?: string;
  /** Brief explanation of the solution */
  explanation_brief?: string;
  /** Detailed step-by-step explanation */
  explanation_detailed?: string;
  // --- Drawing-specific fields (for DRAWING_PROMPT format) ---
  /** Objects to include in the drawing */
  drawing_objects?: string[];
  /** Color constraint (e.g., "primary colors only", "maximum 4 colours") */
  drawing_color_constraint?: string;
  /** Design principle tested (e.g., "balance", "rhythm", "emphasis") */
  drawing_design_principle?: string;
  /** Drawing sub-type */
  drawing_sub_type?: '2d_composition' | '3d_composition' | 'kit_sculpture';
}

// ============================================
// Validation
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  questions: ReviewQuestion[];
}

/**
 * Turn the answer this file gives us into the value the bank stores.
 *
 * bulkCreateDraftQuestions numbers MCQ options by position, 'a' through 'd',
 * and gradeQBAnswerStrict compares against that id. So "A", "a", "(A)" and the
 * option's own label all have to arrive here and leave as 'a'. Getting this
 * wrong would not fail on import: it would mark every student wrong months
 * later, which is why it resolves against the question's real options rather
 * than trusting the letter.
 *
 * Returns null with a reason when it cannot resolve, and the caller drops the
 * answer while keeping the question. A paper that imports 92 questions and 91
 * answers is far better than one that refuses the file.
 */
export function resolveCorrectAnswer(
  raw: string | undefined,
  format: ReviewQuestion['question_format'],
  options: ReviewQuestionOption[],
): { answer: string | undefined; problem?: string } {
  const value = (raw ?? '').trim();
  if (!value) return { answer: undefined };

  if (format === 'DRAWING_PROMPT' || format === 'IMAGE_BASED') {
    return { answer: undefined, problem: 'a drawing has no answer key, so it was ignored' };
  }

  if (format === 'NUMERICAL') return { answer: value };

  // MCQ. Match the option's own label first, since that is what the paper
  // actually printed, then fall back to reading the value as a position.
  const cleaned = value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const byLabel = options.findIndex(
    (o) => (o.label || '').replace(/[^a-z0-9]/gi, '').toLowerCase() === cleaned,
  );
  const index =
    byLabel >= 0
      ? byLabel
      : /^[a-z]$/.test(cleaned)
        ? cleaned.charCodeAt(0) - 97
        : /^[1-9]$/.test(cleaned)
          ? Number(cleaned) - 1
          : -1;

  if (index < 0 || index >= options.length) {
    return { answer: undefined, problem: `answer "${value}" matches none of its options` };
  }
  return { answer: String.fromCharCode(97 + index) };
}

let clientIdCounter = 0;
export function generateClientId(): string {
  return `rq_${Date.now()}_${++clientIdCounter}`;
}

/**
 * Validate and convert BulkUploadJSON into ReviewQuestion[].
 */
export function validateAndConvertJSON(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const questions: ReviewQuestion[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid JSON: expected an object'], warnings, questions };
  }

  const json = data as Record<string, unknown>;

  // Check schema version
  if (json.schema_version !== '1.0') {
    warnings.push(`Unknown schema_version "${json.schema_version}", attempting to parse anyway`);
  }

  // Paper metadata
  if (!json.paper || typeof json.paper !== 'object') {
    errors.push('Missing "paper" object with exam metadata');
    return { valid: false, errors, warnings, questions };
  }

  // Sections
  const sections = json.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.push('Missing or empty "sections" array');
    return { valid: false, errors, warnings, questions };
  }

  for (const section of sections as BulkUploadSection[]) {
    if (!section.questions || !Array.isArray(section.questions)) {
      warnings.push(`Section "${section.name}" has no questions array`);
      continue;
    }

    const sectionKey = section.section_key || inferSectionKey(section.name);

    for (const q of section.questions) {
      if (!q.question_number) {
        warnings.push(`Question missing question_number in section "${section.name}"`);
        continue;
      }

      const format = normalizeFormat(q.question_format);

      const options: ReviewQuestionOption[] = [];
      if (format === 'MCQ' && q.options) {
        for (const opt of q.options) {
          options.push({
            label: opt.label || '',
            text: opt.text || '',
            text_hi: opt.text_hi || undefined,
            image: opt.image ? { url: opt.image, uploaded: false } : undefined,
            nta_id: opt.nta_id,
          });
        }
        if (options.length === 0) {
          warnings.push(`Q${q.question_number}: MCQ with no options`);
        }
      }

      // An answer in this file is optional. When it is here, one paste does the
      // whole paper instead of a second trip through the answer-key screen.
      const resolved = resolveCorrectAnswer(q.correct_answer, format, options);
      if (resolved.problem) {
        warnings.push(`Q${q.question_number}: ${resolved.problem}`);
      }

      questions.push({
        _clientId: generateClientId(),
        question_number: q.question_number,
        question_text: q.question_text || '',
        question_text_hi: q.question_text_hi || undefined,
        question_image: q.question_image ? { url: q.question_image, uploaded: false } : undefined,
        question_format: format,
        options,
        nta_question_id: q.nta_question_id || '',
        section: reconcileSection(sectionKey, format),
        categories: q.categories || inferCategories(reconcileSection(sectionKey, format)),
        correct_answer: resolved.answer,
        answer_tolerance: q.answer_tolerance,
        marks_correct: q.marks_correct,
        marks_negative: q.marks_negative,
        solution_video_url: q.solution_video_url || undefined,
        explanation_brief: q.explanation_brief || undefined,
        explanation_detailed: q.explanation_detailed || undefined,
        // Drawing-specific fields
        ...(format === 'DRAWING_PROMPT' && {
          drawing_objects: q.drawing_objects || undefined,
          drawing_color_constraint: q.drawing_color_constraint || undefined,
          drawing_design_principle: q.drawing_design_principle || undefined,
          drawing_sub_type: q.drawing_sub_type || undefined,
        }),
      });
    }
  }

  if (questions.length === 0) {
    errors.push('No valid questions found in JSON');
  }

  // Check expected count
  const paper = json.paper as Record<string, unknown>;
  if (paper.total_questions && typeof paper.total_questions === 'number') {
    if (questions.length !== paper.total_questions) {
      // Short by a couple is the normal case for a JEE Paper 2 whose drawing
      // sheet was printed separately and is not in the PDF. The extractor is
      // now told to omit those rather than invent them, so this warning fires
      // on exactly the papers where nothing is wrong. Say so, or a teacher
      // re-uploads looking for questions that were never in the file.
      const missing = (paper.total_questions as number) - questions.length;
      const drawingHint =
        missing > 0 && missing <= 3
          ? ' If the drawing sheet was not part of the PDF, this is expected.'
          : '';
      warnings.push(
        `The paper says ${paper.total_questions} questions and the file has ${questions.length}.${drawingHint}`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings, questions };
}

function normalizeFormat(raw: string | undefined): QBQuestionFormat {
  if (!raw) return 'MCQ';
  const upper = raw.toUpperCase();
  if (upper === 'MCQ') return 'MCQ';
  if (upper === 'NUMERICAL' || upper === 'SA' || upper === 'NUM') return 'NUMERICAL';
  if (upper === 'DRAWING_PROMPT' || upper === 'SUBJECTIVE' || upper === 'DRAWING') return 'DRAWING_PROMPT';
  if (upper === 'IMAGE_BASED') return 'IMAGE_BASED';
  return 'MCQ';
}

/**
 * Stop a question's format and its section from contradicting each other.
 *
 * Every question inside a declared section inherits that section's key
 * verbatim, so one mis-titled heading from the extractor relabels the whole
 * block. On a real import that put a run of four-option MCQs into "drawing",
 * where they are marked +50/0 and never auto-graded, and each one had to be
 * corrected by hand.
 *
 * The format is the harder fact: an MCQ with options cannot be a drawing
 * prompt or a numerical answer whatever the heading above it said. Where they
 * disagree the format wins and the section falls back to the one it can
 * actually be.
 */
function reconcileSection(
  section: ReviewQuestion['section'],
  format: QBQuestionFormat,
): ReviewQuestion['section'] {
  if (format === 'DRAWING_PROMPT') return 'drawing';
  if (format === 'NUMERICAL') return 'math_numerical';
  // MCQ and IMAGE_BASED: neither can be drawing or numerical.
  if (section === 'drawing') return 'aptitude';
  if (section === 'math_numerical') return 'math_mcq';
  return section;
}

function inferSectionKey(name: string): ReviewQuestion['section'] {
  const lower = (name || '').toLowerCase();
  if (lower.includes('math') && (lower.includes('mcq') || lower.includes('objective'))) return 'math_mcq';
  if (lower.includes('math') && (lower.includes('num') || lower.includes('integer'))) return 'math_numerical';
  if (lower.includes('math')) return 'math_mcq';
  if (lower.includes('apt') || lower.includes('general')) return 'aptitude';
  if (lower.includes('draw')) return 'drawing';
  return 'aptitude';
}

function inferCategories(sectionKey: ReviewQuestion['section']): string[] {
  switch (sectionKey) {
    case 'math_mcq':
    case 'math_numerical':
      return ['mathematics'];
    case 'aptitude':
      return ['aptitude'];
    case 'drawing':
      return ['drawing'];
  }
}

// ============================================
// Convert NTA parsed data to ReviewQuestion[]
// ============================================

export function ntaParsedToReviewQuestions(
  parsed: { questions: { question_number: number; nta_question_id: string; question_format: QBQuestionFormat; options: { nta_id: string }[]; section: string; categories: string[] }[] }
): ReviewQuestion[] {
  return parsed.questions.map((q) => ({
    _clientId: generateClientId(),
    question_number: q.question_number,
    question_text: '',
    question_format: q.question_format,
    options: q.options.map((opt, i) => ({
      label: String.fromCharCode(65 + i), // A, B, C, D
      text: '',
      nta_id: opt.nta_id,
    })),
    nta_question_id: q.nta_question_id,
    section: q.section as ReviewQuestion['section'],
    categories: q.categories,
  }));
}

// ============================================
// JSON Schema example for AI tool instructions
// ============================================

export const JSON_SCHEMA_EXAMPLE: BulkUploadJSON = {
  schema_version: '1.0',
  paper: {
    exam_name: 'JEE Paper 2 (B.Arch)',
    exam_date: '2025-01-25',
    exam_time: '09:00 - 12:00',
    subject: 'B.Arch / B.Planning',
    total_questions: 82,
  },
  sections: [
    {
      name: 'Mathematics (MCQ)',
      section_key: 'math_mcq',
      question_count: 20,
      questions: [
        {
          question_number: 1,
          question_text: 'If the area of the region bounded by the curves y = x² and y = √x is...',
          question_text_hi: 'यदि वक्रों y = x² और y = √x से घिरे क्षेत्र का क्षेत्रफल है...',
          question_format: 'MCQ',
          nta_question_id: '4951349335',
          options: [
            { label: 'A', text: '1/3', text_hi: '1/3', nta_id: '49513493351' },
            { label: 'B', text: '2/3', text_hi: '2/3', nta_id: '49513493352' },
            { label: 'C', text: '1/6', text_hi: '1/6', nta_id: '49513493353' },
            { label: 'D', text: '5/6', text_hi: '5/6', nta_id: '49513493354' },
          ],
          correct_answer: 'A',
          marks_correct: 4,
          marks_negative: -1,
          categories: ['mathematics'],
          solution_video_url: 'https://youtube.com/watch?v=example',
          explanation_brief: 'Use integration to find the area between y = x² and y = √x.',
          explanation_detailed: 'Step 1: Find intersection points by solving x² = √x → x⁴ = x → x(x³-1) = 0 → x = 0, 1.\nStep 2: Area = ∫₀¹ (√x - x²) dx = [⅔x^(3/2) - x³/3]₀¹ = ⅔ - ⅓ = ⅓.',
        },
      ],
    },
    {
      name: 'Mathematics (Numerical)',
      section_key: 'math_numerical',
      question_count: 5,
      questions: [
        {
          question_number: 21,
          question_text: 'The number of real solutions of the equation...',
          question_format: 'NUMERICAL',
          nta_question_id: '4951349355',
          marks_correct: 4,
          marks_negative: 0,
          categories: ['mathematics'],
        },
      ],
    },
    {
      name: 'Aptitude Test',
      section_key: 'aptitude',
      question_count: 50,
      questions: [
        {
          question_number: 26,
          question_text: 'Which of the following architectural styles...',
          question_text_hi: 'निम्नलिखित में से कौन सी वास्तुकला शैली...',
          question_image: 'data:image/png;base64,iVBOR...',
          question_format: 'MCQ',
          nta_question_id: '4951349380',
          options: [
            { label: 'A', text: 'Gothic', text_hi: 'गोथिक', nta_id: '49513493801' },
            { label: 'B', text: 'Baroque', text_hi: 'बरोक', nta_id: '49513493802' },
            { label: 'C', text: 'Art Deco', text_hi: 'आर्ट डेको', nta_id: '49513493803' },
            { label: 'D', text: 'Modernist', text_hi: 'आधुनिकतावादी', nta_id: '49513493804' },
          ],
          marks_correct: 4,
          marks_negative: -1,
          categories: ['aptitude'],
        },
      ],
    },
    {
      name: 'Drawing Test',
      section_key: 'drawing',
      question_count: 2,
      questions: [
        {
          question_number: 76,
          question_text: 'Design a community centre for a residential colony...',
          question_text_hi: 'एक आवासीय कॉलोनी के लिए एक सामुदायिक केंद्र का डिज़ाइन करें...',
          question_format: 'DRAWING_PROMPT',
          nta_question_id: '4951349400',
          marks_correct: 100,
          marks_negative: 0,
          categories: ['drawing'],
        },
      ],
    },
  ],
};

/**
 * AI prompt template for users to generate JSON from a PDF.
 * Used in the JSON upload tab instructions.
 * Supports both modern NTA-format (2019+) and old-format (pre-2013) papers.
 * Supports bilingual (English + Hindi) extraction.
 */
export const AI_PROMPT_TEMPLATE = `I have a PDF of a JEE Paper 2 (B.Arch) question paper. It may be a **modern NTA format** (2019 onwards, computer-based, with NTA question IDs) or an **older format** (pre-2013, pen-and-paper, with Part I / Part II / Part III sections and options numbered (1), (2), (3), (4)).

Please extract all questions and output them as JSON matching this exact schema:

\`\`\`json
${JSON.stringify(JSON_SCHEMA_EXAMPLE, null, 2)}
\`\`\`

## Format Detection

**Auto-detect the paper format:**

### Modern NTA Format (2019+)
- Computer-based test with NTA question IDs (long numeric strings like "4951349335")
- Sections: Mathematics MCQ, Mathematics Numerical, Aptitude, Drawing
- Options labeled A, B, C, D with NTA option IDs
- Fixed marks: MCQ +4/-1, Numerical +4/0, Drawing +100/0

### Old Format (pre-2013, e.g., 2005, 2008, 2010)
- Pen-and-paper exam, printed booklet
- Sections often labeled: Part I (Mathematics), Part II (Aptitude), Part III (Drawing)
- Options numbered (1), (2), (3), (4) — convert these to labels A, B, C, D
- Marks may vary — read from the paper instructions (e.g., "+3 marks", "+4 marks per correct answer")
- No NTA question IDs — omit \`nta_question_id\` or leave as empty string
- May have sub-parts or different question numbering

## Rules

1. Output ONLY valid JSON, no extra text.
2. Use \`"schema_version": "1.0"\`.
3. Extract \`exam_name\`, \`exam_date\`, \`exam_time\` from the PDF header.
4. **Detect sections from the paper structure** and map to section_key:
   - \`"math_mcq"\` — Mathematics objective/MCQ questions
   - \`"math_numerical"\` — Mathematics numerical/integer-answer questions
   - \`"aptitude"\` — Aptitude Test / General Aptitude questions
   - \`"drawing"\` — Drawing Test questions
   - For old papers: "Part I (Mathematics)" → \`math_mcq\`, "Part II (Aptitude)" → \`aptitude\`, "Part III (Drawing)" → \`drawing\`
5. For each question:
   - Extract \`question_text\` (the full question statement in English).
   - Use LaTeX notation for all mathematical formulas and symbols:
     * Inline math: wrap with single dollar signs, e.g. \`$\\sqrt{x^2 + y^2}$\`
     * Block/display math: wrap with double dollar signs, e.g. \`$$\\int_0^{\\pi} \\sin(x) \\, dx$$\`
     * Use LaTeX for: fractions (\`$\\frac{a}{b}$\`), superscripts (\`$x^2$\`), subscripts (\`$a_n$\`), roots (\`$\\sqrt{x}$\`), Greek letters (\`$\\alpha$\`, \`$\\theta$\`), summations (\`$\\sum$\`), integrals (\`$\\int$\`), matrices, etc.
   - If the question has a diagram/figure, include it as a base64 data URL in \`question_image\`.
   - For MCQ: include all options with labels A, B, C, D (convert from (1),(2),(3),(4) if needed), with LaTeX for math in option text.
   - For NUMERICAL: set \`question_format\` to \`"NUMERICAL"\`, no options needed.
   - For DRAWING_PROMPT: set \`question_format\` to \`"DRAWING_PROMPT"\`. Also extract:
     * \`drawing_objects\`: array of object names to include (e.g. \`["chair", "table", "lamp"]\`)
     * \`drawing_color_constraint\`: color rules (e.g. "primary colors only", "maximum 4 colours")
     * \`drawing_design_principle\`: principle tested (e.g. "balance", "rhythm", "emphasis")
     * \`drawing_sub_type\`: one of \`"2d_composition"\`, \`"3d_composition"\`, \`"kit_sculpture"\`
   - **Only emit a DRAWING_PROMPT when the drawing sheet is actually in this PDF and you can read its prompt text.** The JEE Paper 2 drawing section is printed on a separate sheet and is very often missing from a scanned or downloaded paper. If it is missing, omit the drawing section entirely: no \`"drawing"\` section object, no questions standing in for it.
   - **Never invent a drawing question.** Do not emit \`"Drawing question 1"\`, \`"Drawing Test Question 2"\`, \`"See separate Drawing Sheet"\`, or any other stand-in for a prompt you cannot read. An invented prompt is indistinguishable from a real one once it is in the bank, and a student can be asked to spend ninety minutes drawing it.
   - If the paper's instructions say a drawing section exists but its sheet is not in this PDF, say so in your reply outside the JSON. Do not add a field to the JSON for it, and do not emit questions for it.
   - Include \`nta_question_id\` if visible in the PDF. Omit or use empty string for old-format papers.
6. **Extract marks from paper instructions:**
   - Modern NTA: MCQ +4/-1, Numerical +4/0, Drawing +100/0
   - Old format: Read from the instructions section (e.g., "Each correct answer carries 3 marks", "1 mark deducted for wrong answer")
   - Set \`marks_correct\` and \`marks_negative\` accordingly per question type.
7. **Correct answers are optional, and worth including when the PDF contains them.**
   - If the PDF is a question paper WITH its answer key (a solved paper, or a paper with an answer table at the end), set \`correct_answer\` on each question. That way one file does the whole import and no separate answer key is needed.
   - For MCQ: use the option label exactly as printed, e.g. \`"A"\` (or \`"3"\` for an old paper numbering options (1) to (4)).
   - For NUMERICAL: use the value, e.g. \`"4"\` or \`"2.5"\`. Add \`answer_tolerance\` if the paper allows a range.
   - For DRAWING_PROMPT: omit it. A drawing is marked by a teacher and has no key.
   - **Do NOT guess.** If the answer is not printed in the PDF, omit \`correct_answer\` entirely. A wrong key is far worse than a missing one, because it marks every student wrong without anyone noticing.
8. For each question, include solution details:
   - \`"explanation_brief"\`: A concise 1-2 sentence summary of the solution approach.
   - \`"explanation_detailed"\`: A detailed step-by-step solution with reasoning. Use LaTeX notation (\`$...$\`) for math.
   - \`"solution_video_url"\`: Leave empty or omit if no video is available.

## Bilingual (Hindi) Extraction

If the paper contains **Hindi text alongside English** (bilingual paper):
- Extract the Hindi version of each question as \`"question_text_hi"\`.
- Extract the Hindi version of each option as \`"text_hi"\` inside the options array.
- If the paper is English-only, simply omit all \`_hi\` fields.
- Math formulas and LaTeX remain the same across languages — only extract the **surrounding text** in Hindi.
- Example: if English is "The value of $\\int_0^1 x^2 dx$ is:" then Hindi might be "$\\int_0^1 x^2 dx$ का मान है:"

Here is the PDF:`;

/**
 * Dedicated AI prompt template for Hindi-only extraction.
 * Teachers copy this into Claude/Gemini along with a Hindi (or bilingual) PDF
 * to generate a JSON file for the HindiMergeDialog.
 */
export const HINDI_AI_PROMPT_TEMPLATE = `I have a PDF of a JEE Paper 2 (B.Arch) question paper in Hindi (or bilingual English+Hindi).

Extract ONLY the Hindi text for each question and generate Hindi explanations. Output as JSON:

{
  "questions": [
    {
      "question_number": 1,
      "question_text_hi": "यदि वक्रों $y = x^2$ और $y = \\\\sqrt{x}$ से घिरे क्षेत्र का क्षेत्रफल ज्ञात कीजिए...",
      "options": [
        { "label": "A", "text_hi": "$\\\\frac{1}{3}$" },
        { "label": "B", "text_hi": "$\\\\frac{2}{3}$" },
        { "label": "C", "text_hi": "$\\\\frac{1}{6}$" },
        { "label": "D", "text_hi": "$\\\\frac{5}{6}$" }
      ],
      "explanation_brief_hi": "दोनों वक्रों के प्रतिच्छेदन बिंदु (0,0) और (1,1) हैं। क्षेत्रफल = $\\\\int_0^1 (\\\\sqrt{x} - x^2) dx = \\\\frac{1}{3}$",
      "explanation_detailed_hi": "चरण 1: प्रतिच्छेदन बिंदु ज्ञात करें\\nचरण 2: $\\\\int_0^1 (\\\\sqrt{x} - x^2) dx$\\nचरण 3: $= \\\\frac{2}{3} - \\\\frac{1}{3} = \\\\frac{1}{3}$"
    }
  ]
}

Rules:
1. Output ONLY valid JSON — no markdown, no commentary, no code fences
2. question_number — sequential number as it appears in the paper (1, 2, 3...)
3. question_text_hi — the Hindi question statement from the PDF
4. options — ALWAYS include for MCQ questions. Array of { "label": "A/B/C/D", "text_hi": "..." }
   - If option text is a number (e.g. "16", "3/4"), keep it as-is in text_hi
   - If option text is a math formula, keep the LaTeX identical
   - If option text describes a figure (e.g. "Answer figure 1"), translate the description to Hindi (e.g. "उत्तर चित्र 1")
   - If option text is a word/phrase, translate it to Hindi
   - NEVER skip options — every MCQ must have its options array with text_hi for each option
5. explanation_brief_hi — 1-2 sentence solution summary IN HINDI (generate this yourself)
6. explanation_detailed_hi — step-by-step solution IN HINDI with clear चरण (steps) (generate this yourself)
7. Use LaTeX for ALL math: $\\\\frac{a}{b}$, $\\\\int_0^1$, $\\\\sqrt{x}$, etc.
8. Math formulas are IDENTICAL in Hindi and English — only translate the surrounding text to Hindi
9. For image-based questions where text is in an image: set question_text_hi to "" but still generate explanations
10. For NUMERICAL type questions (integer answer): omit the options array entirely
11. Do NOT include correct_answer, solution_video_url, or any English text fields
12. For Drawing Test questions (Q76-Q82 typically): translate the prompt into question_text_hi ONLY if the drawing sheet is in this PDF and you can read it. If it is not there, omit the question. Never write a stand-in like "Drawing question 1" in either language.

Important Notes:
- CRITICAL: Every MCQ question MUST include the "options" array with text_hi for ALL options (A, B, C, D). Do not skip option translations.
- The explanations should be mathematically accurate and detailed enough for a student to understand
- Use standard Hindi mathematical terminology (क्षेत्रफल for area, परिमाप for perimeter, etc.)
- Keep LaTeX formulas exactly as they appear — do not transliterate math symbols
- If the PDF is bilingual, extract ONLY the Hindi portions
- If a question has no Hindi text visible (English-only), still include it with the Hindi translation

Here is the PDF:`;
