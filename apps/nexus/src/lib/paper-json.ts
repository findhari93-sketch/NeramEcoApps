/**
 * The one JSON a question paper is made of.
 *
 * Almost every paper in the bank was created by uploading a file, and until now
 * that file was a one-way door: BulkUploadJSON could be read and never written,
 * so there was no way to get a paper back out, fix forty explanations in an
 * editor and put it back. The tests module has had exactly this round-trip for
 * a while (GET/PUT /api/question-bank/tests/[id]/import); papers had nothing.
 *
 * It was also thin. It carried no solution image, no registry tags, no
 * difficulty, no choice groups, no duration, and it declared marks_correct and
 * marks_negative that the importer then threw away. A teacher could type a
 * marking scheme into the review screen and watch it vanish.
 *
 * So v2 is a superset, and the rule for it is that a paper's whole skeleton
 * lives here: text, options, answers, marking, explanations, video links, the
 * real storage URL of every image, tags, sections and drawing setup. Download,
 * edit, upload, and the paper is what the file says.
 *
 * PURE. No DB, no fetch, no React. toPaperJSON takes rows and returns a
 * document; parsePaperJSON takes a document and returns rows to write. That is
 * what makes the round-trip directly testable in paper-json.test.ts, and it is
 * why the writer (packages/database/src/queries/nexus/qb-paper-io.ts) holds no
 * schema knowledge of its own.
 */

import {
  QB_SECTION_ORDER,
  isQBQuestionSection,
  qbSectionLabel,
  type NexusQBOriginalPaper,
  type NexusQBQuestion,
  type NexusQBQuestionOption,
  type QBDifficulty,
  type QBExamType,
  type QBQuestionFormat,
  type QBQuestionSection,
  type QBDrawingFocusPoint,
  type QBShift,
  type MarksSource,
  type QBPaperQuestionInput,
} from '@neram/database';

import {
  inferCategories,
  inferSectionKey,
  normalizeFormat,
  reconcileSection,
  resolveCorrectAnswer,
} from './bulk-upload-schema';

export const SCHEMA_NAME = 'nexus-paper';
export const SCHEMA_VERSION = 2;

// ============================================================================
// The document
// ============================================================================

export interface PaperJSONPaper {
  /**
   * Informational only. A paper is identified by the tuple below, never by this,
   * so a file exported from staging still lands on the right paper in prod.
   */
  id?: string | null;
  exam_type: QBExamType;
  year: number;
  session?: string | null;
  shift?: QBShift | null;
  exam_date?: string | null;
  paper_source?: string | null;
  /** Drives whether the built test is timed. Nothing else has ever set this. */
  duration_minutes?: number | null;
  total_questions?: number | null;
  total_marks?: number | null;
  pdf_url?: string | null;
  /** Exported for completeness and deliberately ignored on import: publishing stays a press. */
  is_student_visible?: boolean;
}

export interface PaperJSONOption {
  /** The label the paper printed: "A". Positional order in this array is what actually binds. */
  label: string;
  text: string;
  text_hi?: string | null;
  /** Absolute storage URL, or a data: URI to be uploaded on import. */
  image?: string | null;
  nta_id?: string | null;
}

export interface PaperJSONQuestion {
  question_number: number;
  /** Export only. Matching on import is by question_number. */
  id?: string | null;
  nta_question_id?: string | null;
  question_format: QBQuestionFormat;
  question_text: string;
  question_text_hi?: string | null;

  options?: PaperJSONOption[];
  /** MCQ: the option label. NUMERICAL: the value. Drawings have none. */
  correct_answer?: string | null;
  answer_tolerance?: number | null;

  /** Null means "follow the published scheme", which is what every old paper does. */
  marks_correct?: number | null;
  /** Stored positive. composeTest applies Math.abs, so a sign here would cancel. */
  marks_negative?: number | null;

  difficulty?: QBDifficulty | null;
  /** The legacy taxonomy. Kept alongside tag_slugs because nothing in the DB syncs the two. */
  categories?: string[];
  /** The tag registry. Drawing-type leaves are reachable only through this. */
  tag_slugs?: string[];
  sub_topic?: string | null;

  images?: {
    question?: string | null;
    solution?: string | null;
  };

  solution?: {
    video_url?: string | null;
    explanation_brief?: string | null;
    explanation_detailed?: string | null;
    explanation_brief_hi?: string | null;
    explanation_detailed_hi?: string | null;
  };

  /** DRAWING_PROMPT only. Omitted entirely on every other format. */
  drawing?: {
    objects?: Array<{ name: string; count?: number }> | string[];
    colour_constraint?: string | null;
    design_principle?: string | null;
    sub_type?: string | null;
    marks?: number | null;
    /** Gated: students see these only after they upload. */
    focus_points?: QBDrawingFocusPoint[] | null;
  };

  needs_image?: boolean | null;
  /**
   * "Attempt any one of Q91, Q92".
   *
   * `key` is a label local to this file, not the stored UUID, because a UUID
   * from one environment means nothing in another. The importer mints or reuses
   * a real UUID per distinct key.
   */
  choice_group?: { key: string; pick?: number | null } | null;

  status?: string | null;
  is_active?: boolean;
}

export interface PaperJSONSection {
  name: string;
  section_key: QBQuestionSection;
  question_count: number;
  questions: PaperJSONQuestion[];
}

export interface PaperJSON {
  schema: typeof SCHEMA_NAME;
  version: number;
  exported_at?: string;
  paper: PaperJSONPaper;
  /**
   * What the marks in this file mean. 'scheme' means no question states its own
   * and these are the published defaults, so editing them here does nothing
   * until marks_correct is set on the questions themselves.
   */
  marking?: {
    source: MarksSource;
    scheme?: { objective: [number, number]; drawing: [number, number] };
  };
  sections: PaperJSONSection[];
}

// ============================================================================
// Export: rows in, document out
// ============================================================================

export interface PaperExportInput {
  paper: NexusQBOriginalPaper;
  questions: NexusQBQuestion[];
  /** question id to its number on this paper, from nexus_qb_question_sources. */
  questionNumbers: Record<string, number>;
  /** question id to its registry tag slugs. */
  tagsByQuestion: Record<string, string[]>;
  marking: { source: MarksSource; scheme: { objective: [number, number]; drawing: [number, number] } };
}

/** Drop keys that are null/undefined/empty so the file stays readable by a human. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/** Which section a question is exported under, guessing only when it is unset. */
export function sectionOf(q: NexusQBQuestion): QBQuestionSection {
  if (q.section && isQBQuestionSection(q.section)) return q.section;
  const guess = q.categories?.find((c) => isQBQuestionSection(c)) as QBQuestionSection | undefined;
  return reconcileSection(guess ?? 'aptitude', q.question_format);
}

function optionOut(opt: NexusQBQuestionOption): PaperJSONOption {
  return compact({
    // The bank stores positional ids 'a'..'d' and never a printed label, so the
    // label is derived. resolveCorrectAnswer maps it back on the way in.
    label: (opt.id || '').toUpperCase(),
    text: opt.text ?? '',
    text_hi: opt.text_hi ?? null,
    image: opt.image_url ?? null,
    nta_id: opt.nta_id ?? null,
  }) as PaperJSONOption;
}

function questionOut(
  q: NexusQBQuestion,
  questionNumber: number,
  tagSlugs: string[],
): PaperJSONQuestion {
  const isDrawing = q.question_format === 'DRAWING_PROMPT';

  const solution = compact({
    video_url: q.solution_video_url,
    explanation_brief: q.explanation_brief,
    explanation_detailed: q.explanation_detailed,
    explanation_brief_hi: q.explanation_brief_hi,
    explanation_detailed_hi: q.explanation_detailed_hi,
  });

  // Images are the stored URLs, verbatim. Rows written before the Cloudflare
  // proxy carry *.supabase.co hostnames directly, and rewriting them here would
  // produce a file that does not describe what is actually stored.
  const images = compact({
    question: q.question_image_url,
    solution: q.solution_image_url,
  });

  const drawing = isDrawing
    ? compact({
        objects: q.objects_to_include ?? undefined,
        colour_constraint: q.colour_constraint,
        design_principle: q.design_principle_tested,
        marks: q.drawing_marks,
        focus_points: q.drawing_focus_points,
      })
    : undefined;

  return {
    question_number: questionNumber,
    id: q.id,
    ...compact({ nta_question_id: q.nta_question_id }),
    question_format: q.question_format,
    question_text: q.question_text ?? '',
    ...compact({ question_text_hi: q.question_text_hi }),

    ...(q.options?.length ? { options: q.options.map(optionOut) } : {}),
    ...compact({
      // MCQ answers come out as the printed label so the file reads like the
      // paper. DRAWING_PROMPT and IMAGE_BASED are self-assessed and have no
      // answer key at all (see needsAnswerKey), so emitting one would round-trip
      // into a warning about an answer that was never meaningful.
      correct_answer:
        q.question_format === 'MCQ'
          ? (q.correct_answer?.toUpperCase() ?? null)
          : q.question_format === 'NUMERICAL'
            ? q.correct_answer
            : null,
      answer_tolerance: q.answer_tolerance,
      marks_correct: q.marks_correct,
      marks_negative: q.marks_negative,
      difficulty: q.difficulty,
      categories: q.categories,
      tag_slugs: tagSlugs,
      sub_topic: q.sub_topic,
    }),

    ...(Object.keys(images).length ? { images } : {}),
    ...(Object.keys(solution).length ? { solution } : {}),
    ...(drawing && Object.keys(drawing).length ? { drawing } : {}),

    ...(q.needs_image === null || q.needs_image === undefined ? {} : { needs_image: q.needs_image }),
    ...(q.choice_group_id
      ? { choice_group: { key: q.choice_group_id, pick: q.choice_group_pick ?? 1 } }
      : {}),

    status: q.status,
    is_active: q.is_active,
  };
}

/**
 * Serialise a paper into its document.
 *
 * Sections come out in the order a candidate sits them (QB_SECTION_ORDER), and
 * questions inside a section by their number on the paper, so two exports of an
 * unchanged paper are byte-identical and a diff of two files is readable.
 */
export function toPaperJSON(input: PaperExportInput): PaperJSON {
  const { paper, questions, questionNumbers, tagsByQuestion, marking } = input;

  const bySection = new Map<QBQuestionSection, PaperJSONQuestion[]>();
  for (const q of questions) {
    const section = sectionOf(q);
    const number = questionNumbers[q.id] ?? q.display_order ?? 0;
    const list = bySection.get(section) ?? [];
    list.push(questionOut(q, number, tagsByQuestion[q.id] ?? []));
    bySection.set(section, list);
  }

  const sections: PaperJSONSection[] = [...bySection.entries()]
    .sort((a, b) => QB_SECTION_ORDER[a[0]] - QB_SECTION_ORDER[b[0]])
    .map(([section_key, list]) => {
      const ordered = [...list].sort((a, b) => a.question_number - b.question_number);
      return {
        name: qbSectionLabel(section_key),
        section_key,
        question_count: ordered.length,
        questions: ordered,
      };
    });

  return {
    schema: SCHEMA_NAME,
    version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    paper: compact({
      id: paper.id,
      exam_type: paper.exam_type,
      year: paper.year,
      session: paper.session,
      shift: paper.shift,
      exam_date: (paper as { exam_date?: string | null }).exam_date ?? null,
      paper_source: (paper as { paper_source?: string | null }).paper_source ?? null,
      duration_minutes: paper.duration_minutes,
      total_questions: paper.total_questions,
      total_marks: paper.total_marks,
      pdf_url: paper.pdf_url,
      is_student_visible: paper.is_student_visible,
    }) as PaperJSONPaper,
    marking,
    sections,
  };
}

// ============================================================================
// Import: document in, rows out
// ============================================================================

/**
 * A question ready to be written, in the bank's own column names.
 *
 * Defined in packages/database (qb-paper-io.ts) rather than here, because the
 * writer needs it and cannot import from an app. Aliased so this module stays
 * the one place a reader has to look to understand the format.
 *
 * Every optional field is tri-state and the distinction carries the whole
 * patch behaviour: undefined is "the file did not mention this, leave it", null
 * is "the file cleared it". See parsePaperJSON below.
 */
export type PaperJSONParsedQuestion = QBPaperQuestionInput;

export interface ParsedPaperJSON {
  valid: boolean;
  errors: string[];
  warnings: string[];
  paper: PaperJSONPaper | null;
  questions: PaperJSONParsedQuestion[];
  /** Questions the file described but that could not be read, and why. */
  skipped: Array<{ question_number: number | null; reason: string }>;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

/** v1 `drawing_objects: string[]` and v2 `[{name, count}]` both land here. */
function normalizeObjects(raw: unknown): Array<{ name: string; count?: number }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = raw
    .map((item) => {
      if (typeof item === 'string') {
        const name = item.trim();
        return name ? { name } : null;
      }
      if (item && typeof item === 'object') {
        const name = text((item as { name?: unknown }).name);
        if (!name) return null;
        const count = num((item as { count?: unknown }).count);
        return count === null ? { name } : { name, count };
      }
      return null;
    })
    .filter((v): v is { name: string; count?: number } => v !== null);
  return out.length ? out : null;
}

function normalizeFocusPoints(raw: unknown): QBDrawingFocusPoint[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = raw
    .map((item) => {
      if (typeof item === 'string') {
        const t = item.trim();
        return t ? { text: t } : null;
      }
      if (item && typeof item === 'object') {
        const t = text((item as { text?: unknown }).text);
        if (!t) return null;
        const weight = num((item as { weight?: unknown }).weight);
        return weight === null ? { text: t } : { text: t, weight };
      }
      return null;
    })
    .filter((v): v is QBDrawingFocusPoint => v !== null);
  return out.length ? out : null;
}

/**
 * Read one question, in either schema.
 *
 * v1 kept explanations, video and drawing fields flat on the question and used
 * `question_image` for the figure. v2 groups them under `solution`, `images`
 * and `drawing`. Both are accepted: whichever the file actually carries wins,
 * so a v1 file someone has added a `solution` block to still works.
 *
 * Only keys the file MENTIONS come back. That is what makes a partial file a
 * patch: uploading twelve questions with nothing but a corrected
 * explanation_brief changes twelve explanations and nothing else. Setting every
 * key unconditionally would send null for each omitted one and quietly strip
 * the images, tags and answers off every question in the patch.
 */
function readQuestion(raw: Record<string, unknown>, sectionKey: QBQuestionSection) {
  const solution = (raw.solution ?? {}) as Record<string, unknown>;
  const images = (raw.images ?? {}) as Record<string, unknown>;
  const drawing = (raw.drawing ?? {}) as Record<string, unknown>;

  /** Did the file mention this key, under any of the names it can go by? */
  const has = (...pairs: Array<[Record<string, unknown>, string]>) =>
    pairs.some(([obj, key]) => obj[key] !== undefined);

  /** The value, or undefined when nothing mentioned it. */
  const when = <T>(present: boolean, value: T): T | undefined => (present ? value : undefined);

  const hasFormat = raw.question_format !== undefined;
  const format = normalizeFormat(text(raw.question_format) ?? undefined);
  const section = reconcileSection(sectionKey, format);
  const isDrawing = format === 'DRAWING_PROMPT';

  const rawOptions = Array.isArray(raw.options) ? (raw.options as Record<string, unknown>[]) : [];
  // Positional ids, because that is what the bank stores and what
  // gradeQBAnswerStrict compares against. The file's label is only a hint for
  // resolving the answer.
  const options: NexusQBQuestionOption[] = rawOptions.map((opt, i) => {
    const image = text(opt.image) ?? text(opt.image_url);
    const textHi = text(opt.text_hi);
    const ntaId = text(opt.nta_id);
    return {
      id: String.fromCharCode(97 + i),
      text: text(opt.text) ?? '',
      ...(textHi ? { text_hi: textHi } : {}),
      ...(image ? { image_url: image } : {}),
      ...(ntaId ? { nta_id: ntaId } : {}),
    };
  });

  const labelled = rawOptions.map((opt, i) => ({
    label: text(opt.label) ?? String.fromCharCode(65 + i),
    text: text(opt.text) ?? '',
  }));
  const resolved = resolveCorrectAnswer(text(raw.correct_answer) ?? undefined, format, labelled);

  const tagSlugs = new Set(
    (Array.isArray(raw.tag_slugs) ? raw.tag_slugs : [])
      .map((s) => text(s))
      .filter((s): s is string => s !== null),
  );
  // A drawing's sub-type is a registry tag now, not a column. v1 declared it as
  // its own field and the importer dropped it on the floor; folding it into the
  // tags is what finally makes it survive an import.
  const subType = text(drawing.sub_type) ?? text(raw.drawing_sub_type);
  if (subType) tagSlugs.add(subType);
  const hasTags = raw.tag_slugs !== undefined || Boolean(subType);

  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((c) => text(c)).filter((c): c is string => c !== null)
    : [];

  const parsed: PaperJSONParsedQuestion = {
    question_number: num(raw.question_number)!,

    ...(hasFormat ? { question_format: format, section } : {}),
    ...(raw.question_text !== undefined ? { question_text: text(raw.question_text) } : {}),

    question_text_hi: when(has([raw, 'question_text_hi']), text(raw.question_text_hi)),
    nta_question_id: when(has([raw, 'nta_question_id']), text(raw.nta_question_id)),
    options: when(raw.options !== undefined, options),
    correct_answer: when(has([raw, 'correct_answer']), resolved.answer ?? null),
    answer_tolerance: when(has([raw, 'answer_tolerance']), num(raw.answer_tolerance)),
    marks_correct: when(has([raw, 'marks_correct']), num(raw.marks_correct)),
    marks_negative: when(has([raw, 'marks_negative']), num(raw.marks_negative)),
    difficulty: when(
      has([raw, 'difficulty']),
      (text(raw.difficulty)?.toUpperCase() as QBDifficulty | null) ?? null,
    ),
    categories: raw.categories !== undefined ? categories : hasFormat ? inferCategories(section) : undefined,
    tag_slugs: when(hasTags, [...tagSlugs]),
    sub_topic: when(has([raw, 'sub_topic']), text(raw.sub_topic)),

    question_image_url: when(
      has([images, 'question'], [raw, 'question_image']),
      text(images.question) ?? text(raw.question_image),
    ),
    solution_image_url: when(
      has([images, 'solution'], [raw, 'solution_image']),
      text(images.solution) ?? text(raw.solution_image),
    ),

    solution_video_url: when(
      has([solution, 'video_url'], [raw, 'solution_video_url']),
      text(solution.video_url) ?? text(raw.solution_video_url),
    ),
    explanation_brief: when(
      has([solution, 'explanation_brief'], [raw, 'explanation_brief']),
      text(solution.explanation_brief) ?? text(raw.explanation_brief),
    ),
    explanation_detailed: when(
      has([solution, 'explanation_detailed'], [raw, 'explanation_detailed']),
      text(solution.explanation_detailed) ?? text(raw.explanation_detailed),
    ),
    explanation_brief_hi: when(
      has([solution, 'explanation_brief_hi'], [raw, 'explanation_brief_hi']),
      text(solution.explanation_brief_hi) ?? text(raw.explanation_brief_hi),
    ),
    explanation_detailed_hi: when(
      has([solution, 'explanation_detailed_hi'], [raw, 'explanation_detailed_hi']),
      text(solution.explanation_detailed_hi) ?? text(raw.explanation_detailed_hi),
    ),

    needs_image: when(has([raw, 'needs_image']), bool(raw.needs_image)),
    choice_group_key: when(
      has([raw, 'choice_group']),
      text((raw.choice_group as Record<string, unknown> | null)?.key),
    ),
    choice_group_pick: when(
      has([raw, 'choice_group']),
      num((raw.choice_group as Record<string, unknown> | null)?.pick),
    ),

    // Drawing columns are only ever written for a drawing. Clearing them on an
    // MCQ would be a write with no meaning, and on a paper of 90 MCQs it would
    // turn a no-op re-upload into 90 updates.
    drawing_marks: when(isDrawing && has([drawing, 'marks']), num(drawing.marks)),
    design_principle_tested: when(
      isDrawing && has([drawing, 'design_principle'], [raw, 'drawing_design_principle']),
      text(drawing.design_principle) ?? text(raw.drawing_design_principle),
    ),
    colour_constraint: when(
      isDrawing && has([drawing, 'colour_constraint'], [raw, 'drawing_color_constraint']),
      text(drawing.colour_constraint) ?? text(raw.drawing_color_constraint),
    ),
    objects_to_include: when(
      isDrawing && has([drawing, 'objects'], [raw, 'drawing_objects']),
      normalizeObjects(drawing.objects) ?? normalizeObjects(raw.drawing_objects),
    ),
    drawing_focus_points: when(
      isDrawing && has([drawing, 'focus_points']),
      normalizeFocusPoints(drawing.focus_points),
    ),
  };

  // Strip the keys `when` returned undefined for, so "not mentioned" survives
  // JSON.stringify and an Object.entries walk in the writer.
  for (const key of Object.keys(parsed) as Array<keyof PaperJSONParsedQuestion>) {
    if (parsed[key] === undefined) delete parsed[key];
  }

  return { parsed, problem: resolved.problem };
}

/**
 * Read a document into rows.
 *
 * Tolerant on purpose, and for the same reason resolveCorrectAnswer is: a file
 * that imports 92 questions and 91 answers is far more useful than one that
 * refuses to import at all. A question it cannot read is skipped with a reason
 * and the rest of the paper still lands. Only a document with no identifiable
 * paper or no sections at all is a hard error.
 *
 * Accepts v2 and the original `schema_version: '1.0'` shape, so every file
 * teachers already hold keeps working.
 */
export function parsePaperJSON(data: unknown): ParsedPaperJSON {
  const errors: string[] = [];
  const warnings: string[] = [];
  const questions: PaperJSONParsedQuestion[] = [];
  const skipped: Array<{ question_number: number | null; reason: string }> = [];

  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      errors: ['This is not a JSON object.'],
      warnings,
      paper: null,
      questions,
      skipped,
    };
  }

  const json = data as Record<string, unknown>;

  const isV1 = json.schema_version !== undefined && json.schema !== SCHEMA_NAME;
  if (!isV1 && json.schema !== undefined && json.schema !== SCHEMA_NAME) {
    warnings.push(`Unknown schema "${String(json.schema)}". Reading it as a paper anyway.`);
  }
  if (!isV1 && num(json.version) !== null && num(json.version)! > SCHEMA_VERSION) {
    warnings.push(
      `This file is version ${String(json.version)} and this Nexus reads version ${SCHEMA_VERSION}. Anything newer will be ignored.`,
    );
  }

  const rawPaper = (json.paper ?? {}) as Record<string, unknown>;
  const examType = text(rawPaper.exam_type);
  const year = num(rawPaper.year);

  let paper: PaperJSONPaper | null = null;
  if (examType && year) {
    paper = {
      id: text(rawPaper.id),
      exam_type: examType as QBExamType,
      year,
      session: text(rawPaper.session),
      shift: (text(rawPaper.shift) as QBShift | null) ?? null,
      exam_date: text(rawPaper.exam_date),
      paper_source: text(rawPaper.paper_source),
      duration_minutes: num(rawPaper.duration_minutes),
      total_questions: num(rawPaper.total_questions),
      total_marks: num(rawPaper.total_marks),
      pdf_url: text(rawPaper.pdf_url),
      is_student_visible: bool(rawPaper.is_student_visible) ?? undefined,
    };
  } else if (isV1) {
    // v1 never carried the identity: exam_type, year, session and shift came
    // from the wizard's own form, not from the file. That is not an error, it
    // just means the caller has to say which paper this is.
    warnings.push(
      'This file does not say which paper it is, so the paper it is uploaded to decides.',
    );
  } else {
    errors.push('The "paper" block needs an exam_type and a year.');
  }

  const sections = json.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.push('There is no "sections" array, so there are no questions to read.');
    return { valid: false, errors, warnings, paper, questions, skipped };
  }

  const seen = new Set<number>();

  for (const rawSection of sections as Record<string, unknown>[]) {
    const name = text(rawSection.name) ?? '';
    const declared = text(rawSection.section_key);
    const sectionKey: QBQuestionSection =
      declared && isQBQuestionSection(declared) ? declared : inferSectionKey(name);

    const list = rawSection.questions;
    if (!Array.isArray(list)) {
      warnings.push(`Section "${name || sectionKey}" has no questions array.`);
      continue;
    }

    for (const rawQuestion of list as Record<string, unknown>[]) {
      const number = num(rawQuestion.question_number);
      if (number === null) {
        skipped.push({ question_number: null, reason: 'no question_number' });
        continue;
      }
      if (seen.has(number)) {
        // Two rows claiming the same number would race each other into the same
        // question. Keep the first and say so, rather than letting the last
        // write win invisibly.
        skipped.push({ question_number: number, reason: 'duplicate question_number in this file' });
        continue;
      }

      try {
        const { parsed, problem } = readQuestion(rawQuestion, sectionKey);
        if (problem) warnings.push(`Q${number}: ${problem}`);
        // Deliberately NOT rejected here for having no text and no figure. A
        // patch that only corrects an explanation carries neither, and it is
        // perfectly valid against a question that already exists. Only the
        // writer knows whether this is an insert, so only the writer can say.
        seen.add(number);
        questions.push(parsed);
      } catch (err) {
        skipped.push({
          question_number: number,
          reason: err instanceof Error ? err.message : 'could not be read',
        });
      }
    }
  }

  if (questions.length === 0) errors.push('No readable questions in this file.');

  const total = num(rawPaper.total_questions);
  if (total !== null && total !== questions.length) {
    const missing = total - questions.length;
    const drawingHint =
      missing > 0 && missing <= 3
        ? ' If the drawing sheet was not part of the PDF, this is expected.'
        : '';
    warnings.push(
      `The paper says ${total} questions and the file has ${questions.length}.${drawingHint}`,
    );
  }

  return { valid: errors.length === 0, errors, warnings, paper, questions, skipped };
}

// ============================================================================
// Diff: what would this upload actually do?
// ============================================================================

export interface PaperJSONDiff {
  /** Question numbers the file adds. */
  created: number[];
  /** Question numbers the file changes, and which fields. */
  updated: Array<{ question_number: number; fields: string[] }>;
  /** In the file, identical to what is stored. */
  unchanged: number[];
  /** On the paper and not in the file. Left alone. */
  untouched: number[];
}

/**
 * Sorted keys, nulls dropped. Mirrors `canonical` in qb-paper-io.ts.
 *
 * A real MCQ option row is `{"id":"a","text":"...","image_url":null}` because
 * bulkCreateDraftQuestions writes an explicit null, while the export drops
 * nulls to keep the file readable. Compared raw, every MCQ on the paper reads
 * as changed and the preview promises 47 updates for a file that changed one
 * explanation.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const inner = (value as Record<string, unknown>)[key];
      if (inner === null || inner === undefined) continue;
      out[key] = canonical(inner);
    }
    return out;
  }
  return value;
}

/** Same comparison the writer uses, so the preview cannot promise a different result. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  }
  return false;
}

/**
 * Compare an uploaded document against the paper as it stands.
 *
 * Pure, and deliberately mirrors applyPaperJSON: it only looks at keys the
 * incoming question actually mentions, so a patch file reports the one
 * explanation it changes rather than claiming it rewrites the question.
 *
 * This is what the upload dialog shows before anything is written. Getting it
 * out of step with the writer would be worse than showing nothing, so both read
 * the same parsed shape and use the same equality.
 */
export function diffPaperQuestions(
  current: PaperJSONParsedQuestion[],
  incoming: PaperJSONParsedQuestion[],
): PaperJSONDiff {
  const currentByNumber = new Map(current.map((q) => [q.question_number, q]));
  const diff: PaperJSONDiff = { created: [], updated: [], unchanged: [], untouched: [] };

  for (const q of incoming) {
    const existing = currentByNumber.get(q.question_number);
    if (!existing) {
      diff.created.push(q.question_number);
      continue;
    }

    const fields = (Object.keys(q) as Array<keyof PaperJSONParsedQuestion>)
      .filter((key) => key !== 'question_number')
      .filter((key) => !sameValue(q[key], existing[key]));

    if (fields.length === 0) diff.unchanged.push(q.question_number);
    else diff.updated.push({ question_number: q.question_number, fields: fields.sort() });
  }

  const mentioned = new Set(incoming.map((q) => q.question_number));
  for (const q of current) {
    if (!mentioned.has(q.question_number)) diff.untouched.push(q.question_number);
  }

  return diff;
}

/** A stable, filesystem-safe name for a downloaded paper. */
export function paperJSONFilename(paper: {
  exam_type: string;
  year: number;
  session?: string | null;
  shift?: string | null;
}): string {
  return (
    [paper.exam_type, paper.year, paper.session, paper.shift]
      .filter(Boolean)
      .join('_')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') + '.json'
  );
}
