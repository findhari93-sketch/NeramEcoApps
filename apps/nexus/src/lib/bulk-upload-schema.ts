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
  /** Base64 encoded image or external URL */
  question_image?: string;
  question_format: 'MCQ' | 'NUMERICAL' | 'DRAWING_PROMPT' | 'IMAGE_BASED';
  nta_question_id?: string;
  options?: {
    label: string;
    text: string;
    image?: string;
    nta_id?: string;
  }[];
  marks_correct?: number;
  marks_negative?: number;
  categories?: string[];
  /** Solution video URL (YouTube unlisted or SharePoint) */
  solution_video_url?: string;
  /** Brief explanation of the solution */
  explanation_brief?: string;
  /** Detailed step-by-step explanation */
  explanation_detailed?: string;
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
            image: opt.image ? { url: opt.image, uploaded: false } : undefined,
            nta_id: opt.nta_id,
          });
        }
        if (options.length === 0) {
          warnings.push(`Q${q.question_number}: MCQ with no options`);
        }
      }

      questions.push({
        _clientId: generateClientId(),
        question_number: q.question_number,
        question_text: q.question_text || '',
        question_image: q.question_image ? { url: q.question_image, uploaded: false } : undefined,
        question_format: format,
        options,
        nta_question_id: q.nta_question_id || '',
        section: sectionKey,
        categories: q.categories || inferCategories(sectionKey),
        marks_correct: q.marks_correct,
        marks_negative: q.marks_negative,
        solution_video_url: q.solution_video_url || undefined,
        explanation_brief: q.explanation_brief || undefined,
        explanation_detailed: q.explanation_detailed || undefined,
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
      warnings.push(
        `Expected ${paper.total_questions} questions but found ${questions.length}`
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
          question_format: 'MCQ',
          nta_question_id: '4951349335',
          options: [
            { label: 'A', text: '1/3', nta_id: '49513493351' },
            { label: 'B', text: '2/3', nta_id: '49513493352' },
            { label: 'C', text: '1/6', nta_id: '49513493353' },
            { label: 'D', text: '5/6', nta_id: '49513493354' },
          ],
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
          question_image: 'data:image/png;base64,iVBOR...',
          question_format: 'MCQ',
          nta_question_id: '4951349380',
          options: [
            { label: 'A', text: 'Gothic', nta_id: '49513493801' },
            { label: 'B', text: 'Baroque', nta_id: '49513493802' },
            { label: 'C', text: 'Art Deco', nta_id: '49513493803' },
            { label: 'D', text: 'Modernist', nta_id: '49513493804' },
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
 */
export const AI_PROMPT_TEMPLATE = `I have a PDF of an NTA JEE Paper 2 (B.Arch) answer sheet / question paper. Please extract all questions and output them as JSON matching this exact schema:

\`\`\`json
${JSON.stringify(JSON_SCHEMA_EXAMPLE, null, 2)}
\`\`\`

Rules:
1. Output ONLY valid JSON, no extra text.
2. Use "schema_version": "1.0".
3. Extract exam_name, exam_date, exam_time from the PDF header.
4. Group questions into sections with the correct section_key:
   - "math_mcq" for Mathematics MCQ (Q1-Q20)
   - "math_numerical" for Mathematics Numerical (Q21-Q25)
   - "aptitude" for Aptitude Test (Q26-Q75)
   - "drawing" for Drawing Test (Q76+)
5. For each question:
   - Extract question_text (the full question statement).
   - Use LaTeX notation for all mathematical formulas and symbols:
     * Inline math: wrap with single dollar signs, e.g. $\\sqrt{x^2 + y^2}$
     * Block/display math: wrap with double dollar signs, e.g. $$\\int_0^{\\pi} \\sin(x) \\, dx$$
     * Use LaTeX for: fractions ($\\frac{a}{b}$), superscripts ($x^2$), subscripts ($a_n$), roots ($\\sqrt{x}$), Greek letters ($\\alpha$, $\\theta$), summations ($\\sum$), integrals ($\\int$), matrices, etc.
   - If the question has a diagram/figure, include it as a base64 data URL in question_image.
   - For MCQ: include all 4 options with label (A/B/C/D), text (with LaTeX for math), and nta_id if visible.
   - For NUMERICAL: set question_format to "NUMERICAL", no options needed.
   - For DRAWING_PROMPT: set question_format to "DRAWING_PROMPT".
   - Include nta_question_id if visible in the PDF.
6. Set marks_correct and marks_negative per question type:
   - MCQ: +4 / -1
   - Numerical: +4 / 0
   - Drawing: +100 / 0
7. Do NOT include correct answers (they come from a separate answer key).
8. For each question, include solution details:
   - "explanation_brief": A concise 1-2 sentence summary of the solution approach.
   - "explanation_detailed": A detailed step-by-step solution with reasoning. Use LaTeX notation ($...$) for math.
   - "solution_video_url": Leave empty or omit if no video is available.

Here is the PDF:`;
