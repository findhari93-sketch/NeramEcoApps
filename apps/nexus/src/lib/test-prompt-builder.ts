/**
 * The prompt a teacher copies into ChatGPT or Gemini, with a chapter PDF
 * attached, to write a class test's question pool.
 *
 * PURE and framework-free, so the wizard can rebuild it on every keystroke for
 * the live preview and a unit test can hold its wording.
 *
 * Why this exists next to buildImportPrompt: that one serves the in-app
 * generator, which sends a small count in one call. This one is for a teacher
 * on the free ChatGPT tier who wants a large pool (150) and a random subset per
 * student (50). A pool that size cannot arrive in one reply, so the prompt asks
 * for batches, and the paste box reads several replies one after another.
 *
 * Copy rule for everything in here: no em dashes and no double hyphens. The
 * prompt is text a teacher reads before pasting it.
 */
import { MAX_TAGS_PER_QUESTION, importSampleObject, type ImportExam } from './qb-import-schema';

export type PromptExam = ImportExam;
export type PromptLanguage = 'English' | 'English with Tamil';

export interface QuestionMix {
  recall: boolean;
  identify: boolean;
  assertionReason: boolean;
  matchPairs: boolean;
  chronology: boolean;
  oddOneOut: boolean;
}

export type QuestionKind = keyof QuestionMix;

export interface PromptTag {
  slug: string;
  label: string;
  group_type: string;
}

export interface BuildTestPromptOptions {
  chapterTitle: string;
  exam: PromptExam;
  /** How many questions to write in total. */
  pool: number;
  /** How many each student gets. Clamped to the pool. */
  serve: number;
  mix: QuestionMix;
  language: PromptLanguage;
  tags: PromptTag[];
  /** Questions per reply. 50 fits a free ChatGPT reply. */
  batchSize?: number;
}

export const DEFAULT_BATCH_SIZE = 50;
export const MAX_POOL = 300;

export const DEFAULT_MIX: QuestionMix = {
  recall: true,
  identify: true,
  assertionReason: true,
  matchPairs: true,
  chronology: true,
  oddOneOut: true,
};

/**
 * The shape of a real NATA / JEE Paper 2 general-knowledge section, as
 * weights. Recall and identification carry most of both papers; the
 * structured kinds (assertion and reason, match the following) are fewer but
 * always present. Normalised over whichever kinds the teacher keeps.
 */
export const MIX_WEIGHTS: Record<QuestionKind, number> = {
  recall: 35,
  identify: 25,
  matchPairs: 15,
  assertionReason: 10,
  chronology: 8,
  oddOneOut: 7,
};

export const MIX_ORDER: QuestionKind[] = [
  'recall',
  'identify',
  'matchPairs',
  'assertionReason',
  'chronology',
  'oddOneOut',
];

/** What the teacher sees next to each checkbox. */
export const MIX_LABELS: Record<QuestionKind, string> = {
  recall: 'Direct recall',
  identify: 'Identify from a description',
  matchPairs: 'Match the following',
  assertionReason: 'Assertion and reason',
  chronology: 'Arrange in order',
  oddOneOut: 'Odd one out',
};

/** What the model is told each kind means. */
const MIX_RULES: Record<QuestionKind, string> = {
  recall: 'one fact from the chapter: who, what, where or when.',
  identify:
    'the stem describes a building, architect, style, material or feature without naming it, and the student names it.',
  matchPairs:
    'List I (A, B, C, D) and List II (1, 2, 3, 4) written inside the stem; each option is a full code such as "A-2, B-1, C-4, D-3".',
  assertionReason:
    'an Assertion (A) and a Reason (R) in the stem, with these four options exactly: "Both A and R are true and R is the correct explanation of A", "Both A and R are true but R is not the correct explanation of A", "A is true but R is false", "A is false but R is true".',
  chronology:
    'four items from the chapter to put in time order (earliest first); each option is a different order.',
  oddOneOut:
    'four items where three share a property the fourth lacks; the explanation names the property.',
};

/**
 * Subject tags that can never describe an MCQ written from a chapter: they
 * are drawing and composition skills, graded by a teacher, not by a key.
 */
const DRAWING_SUBJECTS = new Set([
  'drawing',
  'street_view',
  'shape_composition',
  'given_kit_assembly',
  'interior_view',
  'logo_design',
  'free_form_sculpture',
  'poster_design',
  'building_exterior',
  'pattern_motif',
  'portrait_figure',
  'still_life',
  'colour_composition',
  'typography_composition',
  'product_object',
  'perspective_drawing',
  '2d_composition',
  '3d_composition',
  'kit_sculpture',
  'memory_drawing',
]);

/** Mathematics topics. JEE Paper 2 has a maths section; NATA's chapter tests do not. */
const MATHS_SUBJECTS = new Set([
  'mathematics',
  'algebra',
  'coordinate_geometry',
  'calculus',
  'trigonometry',
  'vectors_and_3d_geometry',
  'probability_and_statistics',
  'sets_and_relations',
  'functions',
  'complex_numbers',
  'quadratic_equations',
  'sequences_and_series',
  'permutations_combinations',
  'binomial_theorem',
  'matrices',
  'determinants',
  'mathematical_logic',
  'straight_lines',
  'circles',
  'parabola',
  'ellipse',
  'hyperbola',
  'locus',
  'areas_of_triangles',
  'conic_sections',
  'logarithms',
  'continuity',
  'differentiability',
  'applications_of_derivatives',
  'mean_value_theorems',
  'indefinite_integrals',
  'definite_integrals',
  'differential_equations',
  'vectors',
  '3d_geometry',
  'probability',
  'statistics',
]);

/** Visual and reasoning aptitude topics, the JEE Paper 2 aptitude section. */
const APTITUDE_SUBJECTS = new Set([
  'aptitude',
  'puzzle',
  'perspective',
  'visualization_3d',
  'spatial_visualization',
  'orthographic_projection',
  'pattern_recognition',
  'analogy',
  'counting_figures',
  'odd_one_out',
  'surface_counting',
  'mirror_image',
  'embedded_figure',
]);

/**
 * The tags worth offering the model, by exam.
 *
 * Exam tags are left out on purpose: the exam travels once in test.exam. For
 * NATA only architecture and general-knowledge subjects are offered; for JEE
 * (and both) the maths and aptitude subjects are added. Theme tags are always
 * offered, because they are what makes a bank searchable by topic.
 */
export function promptTagsFor(exam: PromptExam, tags: PromptTag[]): { subject: PromptTag[]; theme: PromptTag[] } {
  const subject: PromptTag[] = [];
  const theme: PromptTag[] = [];
  const seen = new Set<string>();
  for (const t of tags || []) {
    const slug = String(t?.slug || '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    if (t.group_type === 'theme') {
      theme.push(t);
      continue;
    }
    if (t.group_type !== 'subject') continue;
    if (DRAWING_SUBJECTS.has(slug)) continue;
    if (exam === 'NATA' && (MATHS_SUBJECTS.has(slug) || APTITUDE_SUBJECTS.has(slug))) continue;
    subject.push(t);
  }
  return { subject, theme };
}

/**
 * Split `total` across weights so the parts are whole numbers that add up to
 * `total` exactly (largest remainder). Rounding each on its own leaves a
 * 150-question pool asking for 149 or 151.
 */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * total);
  const floors = exact.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

export interface MixLine {
  kind: QuestionKind;
  percent: number;
  count: number;
}

/**
 * The chosen kinds with their share of the pool. Falls back to direct recall
 * alone when nothing is ticked, so the prompt is never asked for zero kinds.
 */
export function mixBreakdown(mix: QuestionMix, pool: number): MixLine[] {
  let kinds = MIX_ORDER.filter((k) => mix?.[k]);
  if (kinds.length === 0) kinds = ['recall'];
  const weights = kinds.map((k) => MIX_WEIGHTS[k]);
  const percents = apportion(100, weights);
  const counts = apportion(Math.max(0, pool), weights);
  return kinds.map((kind, i) => ({ kind, percent: percents[i], count: counts[i] }));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Pool and serve as the prompt will state them: whole, positive, serve never above pool. */
export function normalisePoolServe(pool: unknown, serve: unknown): { pool: number; serve: number } {
  const p = clampInt(pool, 1, MAX_POOL, 150);
  const s = clampInt(serve, 1, p, Math.min(50, p));
  return { pool: p, serve: s };
}

function roleLine(exam: PromptExam): string {
  if (exam === 'NATA') return 'You are a senior paper setter for NATA (Council of Architecture).';
  if (exam === 'JEE') return 'You are a senior paper setter for JEE Main Paper 2 B.Arch (NTA).';
  return 'You are a senior paper setter for NATA (Council of Architecture) and JEE Main Paper 2 B.Arch (NTA).';
}

function examName(exam: PromptExam): string {
  if (exam === 'NATA') return 'NATA';
  if (exam === 'JEE') return 'JEE Main Paper 2';
  return 'NATA and JEE Main Paper 2';
}

function tagLine(group: string, tags: PromptTag[]): string {
  return `${group}: ${tags.map((t) => `${t.slug} (${t.label})`).join(', ')}`;
}

/** The full prompt, ready to paste. */
export function buildTestPrompt(opts: BuildTestPromptOptions): string {
  const exam: PromptExam = opts.exam === 'NATA' || opts.exam === 'JEE' ? opts.exam : 'BOTH';
  const { pool, serve } = normalisePoolServe(opts.pool, opts.serve);
  const batch = clampInt(opts.batchSize ?? DEFAULT_BATCH_SIZE, 5, MAX_POOL, DEFAULT_BATCH_SIZE);
  const chapter = String(opts.chapterTitle || '').replace(/\s+/g, ' ').trim();
  const replies = Math.ceil(pool / batch);
  const mix = mixBreakdown(opts.mix, pool);
  const { subject, theme } = promptTagsFor(exam, opts.tags);

  const chapterRef = chapter ? `the attached chapter, "${chapter}",` : 'the attached chapter';

  const language =
    opts.language === 'English with Tamil'
      ? [
          'LANGUAGE',
          // In brackets rather than on a new line: the paste parser folds
          // whitespace in a stem, so a line break would not survive anyway.
          'Write each stem in English, followed by the same stem in Tamil in brackets, inside the same "question" value.',
          'Keep the names of buildings, architects and styles in English in the Tamil part too.',
          'Write the options, "explanation" and "source_quote" in English only.',
        ]
      : ['LANGUAGE', 'Write everything in clear English that a Class 12 student reads easily.'];

  const tagSection =
    subject.length + theme.length > 0
      ? [
          'TAGS',
          `Put 2 to ${Math.min(5, MAX_TAGS_PER_QUESTION)} slugs in "tag_slugs", only from this list:`,
          ...(subject.length > 0 ? [tagLine('SUBJECT', subject)] : []),
          ...(theme.length > 0 ? [tagLine('THEME', theme)] : []),
          'Use "new_tags" only when a question\'s main theme is genuinely missing from the list. Keep it rare and chapter level, never a one-off phrase, and never a new SUBJECT.',
        ]
      : [
          'TAGS',
          'No tag list was given. Leave "tag_slugs" empty and put the chapter\'s main theme in "new_tags".',
        ];

  const output =
    replies > 1
      ? [
          `Send ${batch} questions per reply, so this takes ${replies} replies.`,
          'After each reply I will type "continue". Then send the next batch, carrying on where you stopped. Never repeat a question from an earlier reply.',
          'Every reply is one complete JSON object in the format below. Repeat the "test" block each time, and put only that reply\'s questions in "questions".',
        ]
      : [`Send all ${pool} questions in one reply, as one JSON object in the format below.`];

  const sample = importSampleObject(exam, '', { title: chapter || undefined, pool, serve });

  // Each part is a line; the whole is one string so the preview, the copy
  // button and the test all see exactly the same text.
  return [
    roleLine(exam),
    `You write multiple choice questions that read exactly like the real ${examName(exam)} paper.`,
    '',
    'TASK',
    `Write ${pool} multiple choice questions from ${chapterRef} and from nothing else.`,
    `Each student will get ${serve} of the ${pool} at random, so every question must stand alone: never refer to another question, "the above" or "the previous question".`,
    'No two questions may test the same fact.',
    '',
    'BEFORE YOU WRITE',
    '1. Read the whole document, start to finish, including tables, captions and boxed notes.',
    '2. List the key facts it teaches (names, dates, places, features, definitions, causes). Keep the list to yourself. It is not part of the reply.',
    `3. Spread the ${pool} questions across the chapter in proportion to how much space each part gets. Do not bunch them at the start.`,
    '',
    'MATCH THE REAL EXAM',
    `Use this mix of question kinds (share of the ${pool}):`,
    ...mix.map((m) => `- ${MIX_LABELS[m.kind]}, ${m.percent}% (about ${m.count}): ${MIX_RULES[m.kind]}`),
    'Every question has four options (a, b, c, d) and exactly one correct answer.',
    'Make the wrong options plausible: take them from the same category or era as the answer, never joke or obviously wrong options.',
    'Never use "All of the above" or "None of the above".',
    'Avoid negative stems. When one is unavoidable, write NOT in capitals.',
    'Keep every stem under 40 words. Only match-the-following and assertion-reason stems may run longer, to hold their lists.',
    'Spread the correct answers evenly across a, b, c and d.',
    '',
    'ACCURACY',
    'Every answer must be supported by a sentence in the document. Copy that sentence, word for word, into "source_quote".',
    'If you cannot find a supporting sentence, skip that question and write a different one. Never guess.',
    '"explanation" is 1 to 2 sentences: why the answer is right, and why the closest wrong option is wrong.',
    '',
    ...language,
    '',
    ...tagSection,
    '',
    'OUTPUT',
    'Reply with only JSON. No markdown fences, no commentary before or after it.',
    ...output,
    'Never cut a question in half. If a reply is running long, end it after the last complete question and close the JSON properly.',
    '"answer" is the option key (a, b, c or d), never the option text.',
    'Set "image_ref" to a short name only when a question cannot be answered without a figure from the document; otherwise null.',
    '',
    'FORMAT',
    JSON.stringify(sample, null, 2),
  ].join('\n');
}
