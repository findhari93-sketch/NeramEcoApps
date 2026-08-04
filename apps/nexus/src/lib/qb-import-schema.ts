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
  test: { title: string; folder_path: string[] };
  questions: ImportQuestion[];
  proposedTags: ProposedTag[];
  /** Row-level problems that dropped a row entirely. */
  errors: string[];
  /** Recoverable issues (unknown slugs dropped, defaults applied, duplicates merged). */
  warnings: string[];
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

/** Dense tagging is the point, so this sits well above the tagging assistant's 5. */
export const MAX_TAGS_PER_QUESTION = 8;
const MAX_QUESTIONS_PER_PASTE = 200;
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
    'Spread the difficulty: roughly 30% EASY, 50% MEDIUM, 20% HARD.',
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
    JSON.stringify(
      {
        test: {
          title: 'The chapter name, read from the document',
          suggested_folder: folder || 'Foundation / The chapter name',
        },
        questions: [
          {
            question: 'The question stem.',
            options: { a: 'first option', b: 'second option', c: 'third option', d: 'fourth option' },
            answer: 'b',
            explanation: 'Why b is right.',
            source_quote: 'The sentence from the document that makes b the answer.',
            difficulty: 'MEDIUM',
            exam: exam,
            tag_slugs: ['history_of_architecture', 'indian_architecture'],
            new_tags: [{ slug: 'mughal_architecture', label: 'Mughal Architecture', group: 'theme' }],
          },
        ],
      },
      null,
      2,
    ),
    '',
    'RULES',
    '"answer" must be one of the option keys (a, b, c, d), not the option text.',
    'Omit "options" only for a numerical-answer question, and then put the number in "answer".',
    'Omit "new_tags" when every tag you need already exists.',
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
  const empty: ImportValidationResult = {
    test: { title: '', folder_path: [] },
    questions: [],
    proposedTags: [],
    errors,
    warnings,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJSON(raw));
  } catch {
    errors.push('Could not read that as JSON. Paste the AI reply exactly, with no extra commentary.');
    return empty;
  }

  let rows: unknown[];
  let testMeta: Record<string, unknown> = {};
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    testMeta = (obj.test as Record<string, unknown>) || {};
    if (Array.isArray(obj.questions)) rows = obj.questions;
    else {
      errors.push('Expected a "questions" array. Ask the AI to reply in the exact format from the prompt.');
      return empty;
    }
  } else {
    errors.push('Expected a JSON object with a "questions" array.');
    return empty;
  }

  if (rows.length === 0) {
    errors.push('The reply contained no questions.');
    return empty;
  }
  if (rows.length > MAX_QUESTIONS_PER_PASTE) {
    warnings.push(
      `Only the first ${MAX_QUESTIONS_PER_PASTE} questions were read. Paste the rest as a second import.`,
    );
    rows = rows.slice(0, MAX_QUESTIONS_PER_PASTE);
  }

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

    const difficulty = normaliseDifficulty(r.difficulty);
    if (!difficulty && r.difficulty != null) {
      warnings.push(`${label}: unknown difficulty "${String(r.difficulty)}", set to MEDIUM.`);
    }
    const exam = normaliseExam(r.exam ?? r.exam_relevance);
    if (!exam && (r.exam ?? r.exam_relevance) != null) {
      warnings.push(`${label}: unknown exam "${String(r.exam ?? r.exam_relevance)}", set to BOTH.`);
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
      exam_relevance: exam || 'BOTH',
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
    },
    questions,
    proposedTags,
    errors,
    warnings,
  };
}
