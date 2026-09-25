/**
 * External-AI question import contract.
 *
 * The teacher copies a generated prompt into ChatGPT / Gemini / Claude with a
 * chapter PDF attached, then pastes the JSON reply back. This module builds
 * that prompt and validates the reply. Framework-free on purpose, mirroring
 * qb-tagging-schema.ts: it runs in the wizard for instant feedback, and the
 * server re-validates the same shapes before writing anything.
 *
 * Design rule inherited from the tagging assistant: a bad row is DROPPED with
 * a message, never allowed to fail the whole paste. A teacher who got 48 good
 * questions and 2 malformed ones should keep the 48.
 */
import { extractJSON } from './qb-tagging-schema';

export type ImportDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type ImportExam = 'JEE' | 'NATA' | 'BOTH';
export type ImportFormat = 'MCQ' | 'NUMERICAL';
export type ImportTagGroup = 'exam' | 'subject' | 'theme';

export interface ImportRegistryTag {
  id: string;
  slug: string;
  label: string;
  group_type: ImportTagGroup;
}

export interface ImportOption {
  id: string;
  text: string;
}

export interface ImportQuestion {
  /** Stable key for the review UI. Positional, so it survives a re-render but not a re-paste. */
  key: string;
  question_text: string;
  question_format: ImportFormat;
  options: ImportOption[] | null;
  correct_answer: string;
  explanation: string | null;
  difficulty: ImportDifficulty;
  exam_relevance: ImportExam;
  /**
   * The sentence from the source document the answer rests on. Null when the
   * model did not give one, which is the whole point: when nobody reads the
   * questions before students do, an unquoted question is an unchecked claim,
   * and the PDF generator drops it. The paste flow only records it.
   */
  source_quote: string | null;
  /**
   * A figure the reply named but did not carry. Optional because a question
   * usually has none, and because the shape predates this field.
   *
   * Deliberately not treated as "this question has an image": nothing has been
   * attached yet, so the review step has to ask for it. That is what the
   * "Q7 references an image, attach it in review" line is built from.
   */
  image_ref?: string | null;
  /** Registry tag ids resolved from known slugs. */
  tag_ids: string[];
  /** Every slug kept for this question, including ones still pending creation. */
  tag_slugs: string[];
  /** The subset of tag_slugs that does not exist yet. */
  new_tag_slugs: string[];
}

export interface ProposedTag {
  slug: string;
  label: string;
  group_type: 'theme';
  /** How many pasted questions asked for it. Lets the review UI sort by usefulness. */
  usage: number;
}

export interface ImportValidationResult {
  test: {
    title: string;
    folder_path: string[];
    /**
     * v3. The exam every question is written for, unless a question names its
     * own. Optional so a v2 reply, and any hand-built result, still type-checks.
     */
    exam?: ImportExam | null;
    /** v3. How many questions the teacher asked for in total. Informational. */
    pool?: number | null;
    /** v3. How many each student gets. Prefills the wizard's "Each student gets". */
    serve?: number | null;
  };
  questions: ImportQuestion[];
  proposedTags: ProposedTag[];
  /** Row-level problems that dropped a row entirely. */
  errors: string[];
  /** Recoverable issues (unknown slugs dropped, defaults applied, duplicates merged). */
  warnings: string[];
  /**
   * What the payload announced itself as. A reply that names no schema is not
   * rejected: every reply before v2 named none, and an external tool that emits
   * the right shape without the label is still useful. It is reported so the
   * upload screen can say "nexus-test v2" rather than guessing.
   */
  schema: { name: string | null; version: number | null; recognised: boolean };
  /**
   * How many separate JSON replies the paste held. ChatGPT cannot send 150
   * questions in one message, so a teacher pastes three replies one after
   * another and they are read as one set. Optional for hand-built results.
   */
  replies?: number;
}

export interface BuildImportPromptOptions {
  /**
   * A chapter or topic hint. Optional, and only ever a hint: the document is
   * the authority on what it covers, so the model is told to name the chapter
   * itself and to overrule this when it disagrees.
   */
  chapter?: string;
  exam?: ImportExam;
  /** How many questions to ask for. */
  count?: number;
  /** Where the teacher intends to file it, offered back as suggested_folder. */
  folderPath?: string[];
  /**
   * The document is attached to the same call rather than by a human in a chat
   * window. Makes source_quote mandatory, because the server drops any question
   * without one and there is no reviewer to catch what slips through.
   */
  fromDocument?: boolean;
}

/**
 * What the payload calls itself.
 *
 * The wizard shows "Schema valid, nexus-test v2" on upload, and the same pair
 * is embedded in the prompt sample, so a teacher who generates elsewhere gets a
 * reply that identifies itself. Bump the version only when a change would make
 * an older reply parse WRONG rather than merely parse without a new field.
 */
export const SCHEMA_NAME = 'nexus-test';
export const SCHEMA_VERSION = 3;
/**
 * Every version this parser reads correctly. v3 only ADDED optional fields
 * (test.exam, test.pool, test.serve) and stopped asking for difficulty, so a
 * v2 reply parses exactly as it always did.
 */
const READABLE_VERSIONS: readonly number[] = [2, 3];

/** Dense tagging is the point, so this sits well above the tagging assistant's 5. */
export const MAX_TAGS_PER_QUESTION = 8;
/**
 * One import, however many replies it arrived in. 300 leaves room for a
 * 150-question pool with plenty to spare; commitImport holds the same number.
 */
export const MAX_QUESTIONS_PER_IMPORT = 300;
const MAX_QUESTIONS_PER_PASTE = MAX_QUESTIONS_PER_IMPORT;
const MIN_QUESTION_CHARS = 10;
/** Short enough to admit a real one-line quote, long enough to reject "yes". */
const MIN_SOURCE_QUOTE_CHARS = 15;
const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/** Same rule as qbSlugify in qb-tags.ts, so a proposed slug survives the round trip unchanged. */
export function importSlugify(input: string): string {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * The reply shape, as an object.
 *
 * Extracted so the prompt and the published format spec are literally the same
 * value. They used to be one inline JSON.stringify inside the prompt, which
 * meant the "copy the JSON format spec" button in the wizard would have been a
 * second, hand-maintained copy: the exact way a contract and its documentation
 * drift apart.
 *
 * v3 moved `exam` up to the test (one value instead of 150 copies of it) and
 * dropped `difficulty`, which nobody used: 97% of the bank sat on the MEDIUM
 * default. `pool` and `serve` appear only when the caller knows them, so the
 * in-app generator's prompt does not show a model a number it never asked for.
 */
export function importSampleObject(
  exam: ImportExam = 'BOTH',
  folder = '',
  extra: { title?: string; pool?: number; serve?: number } = {},
): Record<string, unknown> {
  const test: Record<string, unknown> = {
    title: extra.title || 'The chapter name, read from the document',
    suggested_folder: folder || 'Foundation / The chapter name',
    exam,
  };
  if (typeof extra.pool === 'number' && extra.pool > 0) test.pool = extra.pool;
  if (typeof extra.serve === 'number' && extra.serve > 0) test.serve = extra.serve;
  return {
    schema: SCHEMA_NAME,
    version: SCHEMA_VERSION,
    test,
    questions: [
      {
        question: 'The question stem.',
        options: { a: 'first option', b: 'second option', c: 'third option', d: 'fourth option' },
        answer: 'b',
        explanation: 'Why b is right, and why the closest wrong option is wrong.',
        source_quote: 'The sentence from the document that makes b the answer.',
        image_ref: null,
        tag_slugs: ['history_of_architecture', 'indian_architecture'],
        new_tags: [{ slug: 'mughal_architecture', label: 'Mughal Architecture', group: 'theme' }],
      },
    ],
  };
}

/** The pool and serve the published spec illustrates. */
export const SPEC_EXAMPLE = { pool: 150, serve: 50 } as const;

/**
 * The format spec, for the wizard's "Copy the JSON format only" button.
 *
 * Same sample the prompt carries, plus the rules a human reader needs that the
 * model gets in prose. One source, so a teacher pasting this into an external
 * tool gets a reply this parser accepts.
 */
export const TEST_JSON_SPEC: string = [
  `// ${SCHEMA_NAME} v${SCHEMA_VERSION}: the reply format Neram accepts`,
  '//',
  '// Reply with ONLY this JSON. No commentary, no markdown fences.',
  '// A long set may come as several replies. Each reply is one complete object like this one,',
  '// and they can be pasted into Neram one after another.',
  '// "test.exam" is NATA, JEE or BOTH and applies to every question. A question may set its own "exam".',
  '// "test.pool" is how many questions were written, "test.serve" how many each student gets. Both optional.',
  '// "answer" must be an option key (a, b, c, d), not the option text.',
  '// Omit "options" for a numerical-answer question and put the number in "answer".',
  '// "source_quote" is the sentence the answer rests on. Never omit it.',
  '// "image_ref" names a figure the question needs; attach it during review.',
  '// "new_tags" is only for genuinely new THEME topics, and can be omitted.',
  '',
  JSON.stringify(importSampleObject('BOTH', '', SPEC_EXAMPLE), null, 2),
].join('\n');

/**
 * The full prompt. Two callers: the wizard, where the teacher attaches the PDF
 * themselves in ChatGPT, and the chapter generator, which attaches it to the
 * same request. Both get the same contract so one reply parser serves both.
 */
export function buildImportPrompt(
  registry: ImportRegistryTag[],
  opts: BuildImportPromptOptions = {},
): string {
  const byGroup: Record<string, ImportRegistryTag[]> = { exam: [], subject: [], theme: [] };
  for (const t of registry) (byGroup[t.group_type] || (byGroup[t.group_type] = [])).push(t);
  const tagLines = (['exam', 'subject', 'theme'] as const)
    .filter((g) => (byGroup[g] || []).length > 0)
    .map((g) => `${g.toUpperCase()}: ${(byGroup[g] || []).map((t) => `${t.slug} (${t.label})`).join(', ')}`)
    .join('\n');

  const chapter = (opts.chapter || '').trim();
  const exam = opts.exam || 'BOTH';
  const count = opts.count && opts.count > 0 ? opts.count : 30;
  const folder = (opts.folderPath || []).filter(Boolean).join(' / ');

  return [
    'You are writing architecture entrance-exam questions (NATA / JEE Paper 2) for a question bank.',
    '',
    'TASK',
    `Read the attached document and write ${count} questions on what it covers.`,
    `Target exam: ${exam}.`,
    'Every question must be answerable from the document. Do not invent facts.',
    'Write a one or two sentence explanation for every answer, saying why the answer is right.',
    'Quote, in "source_quote", the sentence or short passage from the document the answer rests on.',
    opts.fromDocument
      ? 'A question with no "source_quote" is discarded without being read by anyone, so quote every one.'
      : 'Copy it from the document rather than paraphrasing it.',
    '',
    'NAMING',
    // The document knows its own chapter better than a filename does, so the
    // hint is offered and overrulable rather than baked into the sample title.
    'Read the chapter name off the document itself and use it for "title" and the first level of "suggested_folder".',
    chapter
      ? `The file is called "${chapter}". Use that only if the document does not name itself more precisely.`
      : 'Nothing else names this chapter, so take the name from the document.',
    '',
    'ALLOWED TAGS (use these slug values, never invent a slug here):',
    tagLines,
    '',
    'TAGGING',
    `Tag each question with 3 to ${MAX_TAGS_PER_QUESTION} slugs from the list above. More accurate tags are better than fewer.`,
    'Include the subject slug, plus every theme slug that genuinely applies, plus an exam slug when the question is exam-specific.',
    'If a genuinely useful topic has no slug in the list, add it to that question\'s "new_tags" instead of forcing a wrong slug.',
    'Keep new_tags rare and reusable: a chapter-level topic, not a one-off phrasing.',
    '',
    'REPLY FORMAT',
    'Reply with ONLY this JSON. No commentary, no markdown fences.',
    JSON.stringify(importSampleObject(exam, folder), null, 2),
    '',
    'RULES',
    '"answer" must be one of the option keys (a, b, c, d), not the option text.',
    'Omit "options" only for a numerical-answer question, and then put the number in "answer".',
    'Omit "new_tags" when every tag you need already exists.',
    'Set "image_ref" to a short name when the question needs a figure, otherwise null.',
    'Never omit "source_quote".',
    'Do not repeat the same question twice.',
  ].join('\n');
}

function normaliseDifficulty(raw: unknown): ImportDifficulty | null {
  const v = String(raw || '').trim().toUpperCase();
  if (v === 'EASY' || v === 'MEDIUM' || v === 'HARD') return v;
  return null;
}

function normaliseExam(raw: unknown): ImportExam | null {
  const v = String(raw || '').trim().toUpperCase();
  if (v === 'JEE' || v === 'NATA' || v === 'BOTH') return v;
  if (v === 'JEE_PAPER_2' || v === 'JEE PAPER 2') return 'JEE';
  return null;
}

function positiveInt(raw: unknown): number | null {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Several replies in one paste
// ---------------------------------------------------------------------------

interface ScannedValue {
  text: string;
  value: unknown;
}

/**
 * Where the JSON value opening at `start` closes, or -1 when it never does.
 *
 * Brackets inside strings do not count, and a backslash escapes the next
 * character, so `"a \"}\" b"` is one string rather than a close. A close of the
 * wrong kind ends the value there: it is not JSON, and the caller moves on.
 */
function matchingClose(raw: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  for (let j = start; j < raw.length; j += 1) {
    const c = raw[j];
    if (inString) {
      if (c === '\\') j += 1;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return j;
      if (stack.length === 0) return j;
    }
  }
  return -1;
}

/** JSON.parse, forgiving the trailing comma chat models add after a last item. */
function parseLenient(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    try {
      return { ok: true, value: JSON.parse(text.replace(/,(\s*[}\]])/g, '$1')) };
    } catch {
      return { ok: false };
    }
  }
}

function isQuestionRow(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.question === 'string' || typeof v.question_text === 'string';
}

/**
 * Whether a JSON value is something worth reading questions from.
 *
 * A whole reply ({ questions: [...] }), a bare array of questions, or one
 * question on its own (what survives from a reply that was damaged partway).
 * Anything else, such as a stray `[2]` in the prose between replies, or the
 * options object inside a damaged question, is ignored.
 */
function isReplyShaped(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(isQuestionRow);
  if (value && typeof value === 'object') {
    return Array.isArray((value as Record<string, unknown>).questions) || isQuestionRow(value);
  }
  return false;
}

/**
 * Every top-level JSON object or array in a paste, in order.
 *
 * Text between them (markdown fences, "Here is batch 2", a "continue" typed
 * into the chat and copied along with the reply) is skipped. A candidate that
 * does not parse is not skipped whole: scanning resumes one character in, so
 * a stray bracket in the prose cannot swallow the reply that follows it, and
 * the complete questions inside a damaged reply are still found.
 */
function scanJsonValues(raw: string): { values: ScannedValue[]; cutOff: boolean; damaged: boolean } {
  const values: ScannedValue[] = [];
  let cutOff = false;
  let damaged = false;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch !== '{' && ch !== '[') {
      i += 1;
      continue;
    }
    const end = matchingClose(raw, i);
    if (end === -1) {
      // Only a candidate that holds questions counts as a reply cut off
      // mid-send; an unmatched bracket in the prose is not worth a warning.
      if (!cutOff && raw.indexOf('"question', i) !== -1) cutOff = true;
      i += 1;
      continue;
    }
    const text = raw.slice(i, end + 1);
    const parsed = parseLenient(text);
    if (parsed.ok) {
      values.push({ text, value: parsed.value });
      i = end + 1;
    } else {
      if (!damaged && text.includes('"question')) damaged = true;
      i += 1;
    }
  }
  return { values, cutOff, damaged };
}

/**
 * Split a paste holding several JSON replies into one string per reply.
 *
 * ChatGPT sends a long set in batches ("I will type continue"), and a teacher
 * pastes all of them into one box. Objects and arrays are found by scanning
 * brackets outside strings, so fences and chat text between replies are
 * dropped. Only values that carry questions are returned.
 */
export function splitJsonReplies(raw: string): string[] {
  return scanJsonValues(String(raw || ''))
    .values.filter((v) => isReplyShaped(v.value))
    .map((v) => v.text);
}

/** Accepts {a:'..',b:'..'} or ['..','..'] or [{id,text}], all of which models emit. */
function parseOptions(raw: unknown): ImportOption[] | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    const out: ImportOption[] = [];
    raw.forEach((entry, i) => {
      const key = OPTION_KEYS[i];
      if (!key) return;
      if (typeof entry === 'string') {
        if (entry.trim()) out.push({ id: key, text: entry.trim() });
        return;
      }
      const obj = entry as Record<string, unknown>;
      const text = typeof obj?.text === 'string' ? obj.text : typeof obj?.label === 'string' ? obj.label : '';
      if (!text.trim()) return;
      // A supplied id is only honoured when it is one of the canonical keys.
      // Anything else (an "opt_0_1773..." style id) is renumbered, because
      // correct_answer is matched against these ids at grading time.
      const supplied = typeof obj?.id === 'string' ? obj.id.trim().toLowerCase() : '';
      const id = (OPTION_KEYS as readonly string[]).includes(supplied) ? supplied : key;
      out.push({ id, text: text.trim() });
    });
    return out.length > 0 ? out : null;
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const out: ImportOption[] = [];
    for (const key of OPTION_KEYS) {
      const value = obj[key] ?? obj[key.toUpperCase()];
      if (typeof value === 'string' && value.trim()) out.push({ id: key, text: value.trim() });
    }
    return out.length > 0 ? out : null;
  }

  return null;
}

/**
 * Resolve the model's answer to an option id.
 * Accepts the key ('b'), the key with punctuation ('B)'), or the full option text,
 * because all three come back in practice and only the key is gradable.
 */
function resolveMCQAnswer(raw: unknown, options: ImportOption[]): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (options.some((o) => o.id === key)) return key;

  const byText = options.find((o) => o.text.trim().toLowerCase() === value.toLowerCase());
  return byText ? byText.id : null;
}

function parseFolderPath(raw: unknown): string[] {
  return String(raw || '')
    .split(/[/>]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

/**
 * Validate a pasted AI reply against the live tag registry.
 *
 * Unknown slugs are dropped unless the same reply proposes them in new_tags.
 * Only THEME tags can be proposed: exam and subject tags are the curated,
 * is_system vocabulary, and letting a paste extend them would let one chapter
 * import reshape the whole bank's taxonomy.
 */
export function validateImportJSON(
  raw: string,
  registry: ImportRegistryTag[],
): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unlabelled = { name: null, version: null, recognised: false };
  const empty: ImportValidationResult = {
    test: { title: '', folder_path: [] },
    questions: [],
    proposedTags: [],
    errors,
    warnings,
    schema: unlabelled,
  };

  // Several replies pasted one after another are read as one set. A paste
  // with none that look like a reply falls back to the single-value path, so a
  // wrong-shaped file still gets the specific message it always got.
  const scan = scanJsonValues(String(raw || ''));
  let replies: unknown[] = scan.values.filter((v) => isReplyShaped(v.value)).map((v) => v.value);
  if (replies.length === 0) {
    try {
      replies = [JSON.parse(extractJSON(raw))];
    } catch {
      errors.push('Could not read that as JSON. Paste the AI reply exactly, with no extra commentary.');
      return empty;
    }
  }
  const single = replies.length === 1;

  let rows: unknown[] = [];
  let testMeta: Record<string, unknown> = {};
  let schema = unlabelled as ImportValidationResult['schema'];
  let replyCount = 0;
  for (const reply of replies) {
    if (Array.isArray(reply)) {
      rows = rows.concat(reply);
      replyCount += 1;
      continue;
    }
    if (!reply || typeof reply !== 'object') {
      if (single) {
        errors.push('Expected a JSON object with a "questions" array.');
        return empty;
      }
      continue;
    }
    const obj = reply as Record<string, unknown>;
    if (!Array.isArray(obj.questions)) {
      // One question on its own is what survives from a damaged reply.
      if (isQuestionRow(obj)) {
        rows.push(obj);
        continue;
      }
      if (single) {
        errors.push('Expected a "questions" array. Ask the AI to reply in the exact format from the prompt.');
        return empty;
      }
      continue;
    }
    replyCount += 1;
    rows = rows.concat(obj.questions as unknown[]);
    // Every reply repeats the test block; the first value given for each field
    // wins, so a later batch cannot quietly rename the test.
    const meta = obj.test && typeof obj.test === 'object' ? (obj.test as Record<string, unknown>) : {};
    testMeta = { ...meta, ...testMeta };
    if (schema.name === null && typeof obj.schema === 'string') {
      const name = obj.schema.trim();
      const version = Number.isFinite(Number(obj.version)) ? Number(obj.version) : null;
      schema = {
        name,
        version,
        recognised: name === SCHEMA_NAME && version !== null && READABLE_VERSIONS.includes(version),
      };
      // A newer payload is a warning, not a rejection: the parser only ever
      // reads fields it knows, so the worst case is that something new is
      // ignored, and refusing the whole file would be a harsher answer than the
      // risk deserves.
      if (name === SCHEMA_NAME && version !== null && version > SCHEMA_VERSION) {
        warnings.push(
          `This file says ${name} v${version} and this version of Neram reads v${SCHEMA_VERSION}. Anything newer is ignored.`,
        );
      }
    }
  }

  if (scan.cutOff) {
    warnings.push(
      'The last reply stops partway through. Type "continue" in the chat and paste the next reply below this one.',
    );
  }
  if (scan.damaged) {
    warnings.push('Part of the paste was not valid JSON, so only the complete questions inside it were read.');
  }

  if (rows.length === 0) {
    errors.push('The reply contained no questions.');
    return { ...empty, replies: replyCount };
  }
  if (rows.length > MAX_QUESTIONS_PER_PASTE) {
    warnings.push(
      `Only the first ${MAX_QUESTIONS_PER_PASTE} questions were read. Paste the rest as a second import.`,
    );
    rows = rows.slice(0, MAX_QUESTIONS_PER_PASTE);
  }

  const testExam = normaliseExam(testMeta.exam);

  const slugToTag = new Map<string, ImportRegistryTag>();
  for (const t of registry) slugToTag.set(t.slug.toLowerCase(), t);

  const proposed = new Map<string, ProposedTag>();
  const questions: ImportQuestion[] = [];
  const seenText = new Set<string>();

  rows.forEach((row, index) => {
    const label = `Question ${index + 1}`;
    const r = (row || {}) as Record<string, unknown>;

    const text = String(r.question ?? r.question_text ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < MIN_QUESTION_CHARS) {
      errors.push(`${label}: no question text, skipped.`);
      return;
    }
    // Collapse repeats inside one paste. Models restate a question when asked
    // for more than the document supports, and importing both would then be
    // caught by the dedupe step as a duplicate of something not yet saved.
    const fingerprint = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenText.has(fingerprint)) {
      warnings.push(`${label}: repeats an earlier question in this paste, skipped.`);
      return;
    }

    // Format is inferred from the payload, not from what the model claims it
    // wrote: a row labelled NUMERICAL that still carries four options is an MCQ,
    // and grading it as numerical would compare "b" against a number.
    const options = parseOptions(r.options);
    const format: ImportFormat = options ? 'MCQ' : 'NUMERICAL';

    let correctAnswer: string | null;
    if (format === 'MCQ') {
      if (!options || options.length < 2) {
        errors.push(`${label}: needs at least two options, skipped.`);
        return;
      }
      correctAnswer = resolveMCQAnswer(r.answer ?? r.correct_answer, options);
      if (!correctAnswer) {
        errors.push(`${label}: the answer does not match any option, skipped.`);
        return;
      }
    } else {
      correctAnswer = String(r.answer ?? r.correct_answer ?? '').trim() || null;
      if (!correctAnswer) {
        errors.push(`${label}: no answer given, skipped.`);
        return;
      }
    }

    // v3 stopped asking for difficulty. A reply that still sends one is read
    // without comment, and one that does not is never nagged: the column keeps
    // its MEDIUM default either way.
    const difficulty = normaliseDifficulty(r.difficulty);
    const exam = normaliseExam(r.exam ?? r.exam_relevance);
    if (!exam && (r.exam ?? r.exam_relevance) != null) {
      warnings.push(
        `${label}: unknown exam "${String(r.exam ?? r.exam_relevance)}", set to ${testExam || 'BOTH'}.`,
      );
    }

    // new_tags first, so a slug used in tag_slugs AND proposed in the same row
    // is recognised as pending rather than dropped as unknown.
    const pendingHere = new Set<string>();
    const rawNew = Array.isArray(r.new_tags) ? (r.new_tags as unknown[]) : [];
    for (const entry of rawNew) {
      const t = (entry || {}) as Record<string, unknown>;
      const rawLabel = typeof t.label === 'string' ? t.label.trim() : '';
      const slug = importSlugify(typeof t.slug === 'string' && t.slug.trim() ? t.slug : rawLabel);
      if (!slug) continue;
      if (slugToTag.has(slug)) continue; // already real, nothing to propose
      const group = String(t.group ?? t.group_type ?? 'theme').toLowerCase();
      if (group !== 'theme') {
        warnings.push(`${label}: proposed "${slug}" as a ${group} tag, which is curated. It will be a theme tag.`);
      }
      const existing = proposed.get(slug);
      if (existing) existing.usage += 1;
      else {
        proposed.set(slug, {
          slug,
          label: rawLabel || slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          group_type: 'theme',
          usage: 1,
        });
      }
      pendingHere.add(slug);
    }

    const tagIds: string[] = [];
    const tagSlugs: string[] = [];
    const newTagSlugs: string[] = [];
    const rawSlugs = Array.isArray(r.tag_slugs) ? (r.tag_slugs as unknown[]) : [];
    for (const s of rawSlugs) {
      if (typeof s !== 'string') continue;
      const slug = s.trim().toLowerCase();
      if (!slug || tagSlugs.includes(slug)) continue;
      const known = slugToTag.get(slug);
      if (known) {
        tagIds.push(known.id);
        tagSlugs.push(known.slug);
        continue;
      }
      const normalised = importSlugify(slug);
      if (pendingHere.has(normalised) || proposed.has(normalised)) {
        tagSlugs.push(normalised);
        newTagSlugs.push(normalised);
        continue;
      }
      warnings.push(`${label}: unknown tag "${s}" dropped.`);
    }
    // A slug proposed in new_tags but never listed in tag_slugs is still meant
    // for this question. Dropping it would lose the model's best signal.
    for (const slug of pendingHere) {
      if (!tagSlugs.includes(slug)) {
        tagSlugs.push(slug);
        newTagSlugs.push(slug);
      }
    }
    if (tagSlugs.length === 0) {
      warnings.push(`${label}: no usable tags, it will import untagged.`);
    }

    seenText.add(fingerprint);
    questions.push({
      key: `q${index}`,
      question_text: text,
      question_format: format,
      options: format === 'MCQ' ? options : null,
      correct_answer: correctAnswer,
      explanation: typeof r.explanation === 'string' && r.explanation.trim() ? r.explanation.trim() : null,
      // Kept verbatim rather than normalised: a quote that has been reflowed is
      // no longer quite a quote, and the only thing read off it is whether it
      // is there. A one-word "yes" is not evidence, hence the length floor.
      source_quote:
        typeof r.source_quote === 'string' && r.source_quote.trim().length >= MIN_SOURCE_QUOTE_CHARS
          ? r.source_quote.trim()
          : null,
      difficulty: difficulty || 'MEDIUM',
      exam_relevance: exam || testExam || 'BOTH',
      // Named but not carried. Kept so review can ask for the file rather than
      // letting a question that needs a figure reach a student without one.
      image_ref:
        typeof r.image_ref === 'string' && r.image_ref.trim()
          ? r.image_ref.trim()
          : typeof r.image === 'string' && r.image.trim()
            ? r.image.trim()
            : null,
      tag_ids: tagIds.slice(0, MAX_TAGS_PER_QUESTION),
      tag_slugs: tagSlugs.slice(0, MAX_TAGS_PER_QUESTION),
      new_tag_slugs: newTagSlugs.slice(0, MAX_TAGS_PER_QUESTION),
    });
  });

  if (questions.length === 0) {
    errors.push('No usable questions in that reply.');
  }

  // Only keep proposals something actually still references, since a question
  // that got dropped may have been the only one asking for its new tag.
  const referenced = new Set(questions.flatMap((q) => q.new_tag_slugs));
  const proposedTags = [...proposed.values()]
    .filter((t) => referenced.has(t.slug))
    .sort((a, b) => b.usage - a.usage || a.label.localeCompare(b.label));

  return {
    test: {
      title: String(testMeta.title || '').trim(),
      folder_path: parseFolderPath(testMeta.suggested_folder ?? testMeta.folder),
      exam: testExam,
      pool: positiveInt(testMeta.pool),
      serve: positiveInt(testMeta.serve),
    },
    questions,
    proposedTags,
    errors,
    warnings,
    schema,
    // Damaged fragments are not replies of their own; they belong to one.
    replies: Math.max(replyCount, 1),
  };
}

export type ValidationCheckLevel = 'ok' | 'warning' | 'error';

export interface ValidationCheck {
  level: ValidationCheckLevel;
  message: string;
}

/**
 * The VALIDATION list on the upload screen, as data.
 *
 * Ordered so the two structural questions ("is this the right shape", "did the
 * questions survive") are answered before the per-row nitpicks. A teacher who
 * pasted the wrong thing entirely should learn that on the first line, not
 * after reading eight tag warnings.
 *
 * The passing checks are included on purpose. "15 questions found, all have a
 * correct answer" is the line that makes the upload feel safe, and a screen
 * that only ever shows problems cannot tell a clean file from an unchecked one.
 */
export function validationReport(result: ImportValidationResult): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const n = result.questions.length;

  if (result.schema.recognised) {
    checks.push({ level: 'ok', message: `Schema valid, ${SCHEMA_NAME} v${result.schema.version ?? SCHEMA_VERSION}` });
  } else if (result.schema.name) {
    checks.push({
      level: 'warning',
      message: `File says ${result.schema.name} v${result.schema.version ?? '?'}, read as ${SCHEMA_NAME} v${SCHEMA_VERSION}`,
    });
  } else if (n > 0) {
    // The common case for anything pasted out of a chat window, and not a
    // problem: the shape is what matters, the label is a convenience.
    checks.push({ level: 'ok', message: 'Readable, though the file does not name a schema' });
  }

  if (n === 0) {
    checks.push({ level: 'error', message: 'No usable questions in this file' });
  } else {
    const missingAnswer = result.questions.filter((q) => !String(q.correct_answer ?? '').trim()).length;
    const replies = result.replies ?? 1;
    // "148 questions read from 3 replies" is the line that tells a teacher who
    // pasted three ChatGPT replies that all three landed, not just the first.
    const found =
      replies > 1
        ? `${n} question${n === 1 ? '' : 's'} read from ${replies} replies`
        : `${n} question${n === 1 ? '' : 's'} found`;
    checks.push(
      missingAnswer === 0
        ? { level: 'ok', message: `${found}, all have a correct answer` }
        : { level: 'error', message: `${found}, ${missingAnswer} with no correct answer` },
    );

    const images = result.questions.filter((q) => q.image_ref);
    if (images.length > 0) {
      const which = images
        .map((q) => `Q${result.questions.indexOf(q) + 1}`)
        .slice(0, 3)
        .join(', ');
      checks.push({
        level: 'warning',
        message: `${which}${images.length > 3 ? ' and others' : ''} reference an image, attach it in review`,
      });
    }
  }

  for (const message of result.errors) checks.push({ level: 'error', message });
  for (const message of result.warnings) checks.push({ level: 'warning', message });
  return checks;
}
