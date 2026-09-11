/**
 * External-AI question review contract (the question doctor on the results tab).
 *
 * The teacher selects the questions almost nobody got right, copies a generated
 * prompt into ChatGPT / Gemini / Claude, then pastes the reply back. This module
 * builds that prompt and validates the reply. Framework-free on purpose, mirroring
 * qb-tagging-schema.ts: it runs in the dialog for instant feedback and the same
 * normalization applies before anything is written.
 *
 * The prompt carries the PERFORMANCE data, and that is the whole point. An AI
 * shown only a question cannot tell a wrong answer key from a hard question. An
 * AI told "0 of 9 got this right and all 9 picked Bronze Age" can, because that
 * pattern only happens when the key disagrees with what was taught.
 *
 * Tri-state, borrowed from paper-json.ts: a field the reply does not mention is
 * DELETED from the parsed row, so a partial reply is a patch. Collapsing that
 * into null would let a reply that only fixes an answer key blank the
 * explanations of every question it touched.
 */

import { extractJSON } from './qb-tagging-schema';

/** Questions per copy-paste chunk. Twenty keeps a reply inside most output caps. */
export const REVIEW_CHUNK_SIZE = 20;

const MAX_NOTE_CHARS = 300;
const MAX_TEXT_CHARS = 600;

export type ReviewVerdict = 'wrong_key' | 'ambiguous' | 'hard_but_fair' | 'fine';

const VERDICTS: ReviewVerdict[] = ['wrong_key', 'ambiguous', 'hard_but_fair', 'fine'];

const VERDICT_MEANING: Record<ReviewVerdict, string> = {
  wrong_key: 'the stored correct_answer is wrong, another option is right',
  ambiguous: 'the wording or the options let more than one answer be defended',
  hard_but_fair: 'the question is sound, the class simply did not know it',
  fine: 'nothing wrong, the low score is noise (too few answers to judge)',
};

export interface ReviewOption {
  id: string;
  text: string;
}

/** A question as it stands today, which is what the AI is asked to judge. */
export interface ReviewExportQuestion {
  id: string;
  question_text: string | null;
  options: ReviewOption[] | null;
  correct_answer: string | null;
  explanation_brief?: string | null;
}

/** How the class actually did on it. Straight off NexusQuestionAnalysisRow. */
export interface ReviewStat {
  answered: number;
  correct: number;
  correct_pct: number | null;
  top_wrong_option: { key: string; text: string | null; count: number } | null;
}

/**
 * One row of the reply. Every optional field is tri-state: absent means "the
 * reply said nothing, leave it", null means "the reply cleared it".
 */
export interface QuestionReviewRow {
  question_id: string;
  verdict: ReviewVerdict;
  note: string;
  question_text?: string | null;
  options?: ReviewOption[] | null;
  correct_answer?: string | null;
  explanation_brief?: string | null;
}

export interface ReviewValidationResult {
  rows: QuestionReviewRow[];
  /** Row-level problems that dropped a whole row. */
  errors: string[];
  /** Recoverable problems: one field dropped, or a value resolved for you. */
  warnings: string[];
}

export type ReviewField = 'question_text' | 'options' | 'correct_answer' | 'explanation_brief';

export interface ReviewFieldChange {
  field: ReviewField;
  before: string | null;
  after: string | null;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export function reviewChunks<T>(items: T[], size: number = REVIEW_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

/**
 * A one-line summary of how the class did, in words rather than a stats blob.
 * Returns null when there is nothing to say, so the key is dropped from the
 * JSON rather than serialised as undefined.
 */
function performanceLine(stat: ReviewStat | undefined): string | null {
  if (!stat || stat.answered <= 0) return null;
  const base = `${stat.correct} of ${stat.answered} got it right`;
  if (!stat.top_wrong_option) return base;
  const label = stat.top_wrong_option.text || stat.top_wrong_option.key;
  return `${base}, ${stat.top_wrong_option.count} picked "${label}"`;
}

/** The full copy-paste prompt for one chunk of questions. */
export function buildQuestionReviewPrompt(
  questions: ReviewExportQuestion[],
  stats: Map<string, ReviewStat>,
): string {
  const questionLines = questions.map((q) => {
    const performance = performanceLine(stats.get(q.id));
    const payload: Record<string, unknown> = {
      id: q.id,
      text: (q.question_text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS) ||
        '(image-based question)',
    };
    if (q.options && q.options.length > 0) {
      payload.options = q.options.map((o) => ({ id: o.id, text: o.text }));
    }
    payload.correct_answer = q.correct_answer;
    if (performance) payload.performance = performance;
    return JSON.stringify(payload);
  });

  return [
    'You are reviewing multiple-choice questions from an architecture entrance-exam',
    'course (NATA / JEE Paper 2). Each question below did badly, and the teacher needs',
    'to know WHY before deciding what to fix.',
    '',
    'The "performance" line is how the class actually answered. Use it. When almost',
    'everybody picked the same wrong option, the stored correct_answer is usually the',
    'thing that is wrong, not the class.',
    '',
    'For each question give exactly one verdict:',
    ...VERDICTS.map((v) => `  ${v}: ${VERDICT_MEANING[v]}`),
    '',
    'When you can improve the question, also return the corrected fields. Rules:',
    '  - correct_answer MUST be one of the option ids shown (for example "b"), never',
    '    the option text and never a letter that is not in the list.',
    '  - If you return options, return ALL of them, keeping the same ids in the same',
    '    order. Only the text may change. Never renumber or reorder them.',
    '  - Omit any field you are not changing. Do not echo fields back unchanged.',
    '',
    'QUESTIONS (JSON, one per line):',
    ...questionLines,
    '',
    'Reply with ONLY this JSON, no commentary, no markdown fences:',
    '{"reviews":[{"question_id":"<id from the input>","verdict":"<one of the four>",' +
      '"note":"<one short sentence for the teacher>","correct_answer":"<option id, optional>",' +
      '"question_text":"<optional>","options":[{"id":"a","text":"..."}],' +
      '"explanation_brief":"<optional>"}]}',
    'Include every question exactly once, in the same order.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Validating the reply
// ---------------------------------------------------------------------------

function shortId(id: string): string {
  return `${id.slice(0, 8)}...`;
}

/**
 * Turn whatever the model called the answer into a stored option id.
 *
 * Tries the id, then the option TEXT, then a 1-based position, in that order.
 * The text case is not politeness: asked "which option is right", a model
 * naturally answers "Bronze Age civilization", and refusing that would leave the
 * wrong key in place on exactly the question the teacher came to fix. The order
 * matters, because a bank whose option ids are "1".."4" must still resolve by id
 * before position is considered.
 */
function resolveAnswer(
  value: string,
  question: ReviewExportQuestion,
): { value?: string; warning?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { warning: 'the correct_answer was empty, it was left alone' };

  const options = question.options;
  // A numerical or drawing question has no options to check against, so the
  // value is whatever the grader will compare with.
  if (!options || options.length === 0) return { value: trimmed };

  const lower = trimmed.toLowerCase();

  const byId = options.find((o) => o.id.trim().toLowerCase() === lower);
  if (byId) return { value: byId.id };

  const byText = options.find((o) => (o.text || '').trim().toLowerCase() === lower);
  if (byText) {
    return {
      value: byText.id,
      warning: `the correct_answer came back as text, matched it to option "${byText.id}"`,
    };
  }

  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed) - 1;
    if (index >= 0 && index < options.length) {
      return {
        value: options[index].id,
        warning: `the correct_answer came back as a position, matched it to option "${options[index].id}"`,
      };
    }
  }

  return {
    value: undefined,
    warning: `the correct_answer "${trimmed.slice(0, 40)}" matches no option on this question, it was left alone`,
  };
}

/**
 * Accept a rewritten options array only when it maps cleanly onto the stored one.
 *
 * A renumbered array is refused rather than repaired. correct_answer is stored
 * POSITIONALLY ('a', not the printed 'A'), so silently accepting new ids would
 * repoint the stored answer at different text and nothing downstream would ever
 * notice.
 */
function resolveOptions(
  raw: unknown,
  question: ReviewExportQuestion,
): { value?: ReviewOption[]; warning?: string } {
  const stored = question.options;
  if (!stored || stored.length === 0) {
    return { warning: 'options came back for a question that has none, they were ignored' };
  }
  if (!Array.isArray(raw)) {
    return { warning: 'options were not a list, they were ignored' };
  }
  if (raw.length !== stored.length) {
    return {
      warning: `expected ${stored.length} options, got ${raw.length}, they were ignored`,
    };
  }

  const entries = raw as Array<Record<string, unknown>>;
  const texts = entries.map((e) => (typeof e?.text === 'string' ? e.text.trim() : null));
  if (texts.some((t) => t === null || t === '')) {
    return { warning: 'one of the options had no text, they were ignored' };
  }

  const ids = entries.map((e) => (typeof e?.id === 'string' && e.id.trim() ? e.id.trim() : null));
  const withId = ids.filter((id) => id !== null).length;

  if (withId === 0) {
    // No ids at all is the ordinary case: a model rewriting wording does not
    // echo ids back. Position is then the only honest reading.
    return {
      value: stored.map((o, i) => ({ id: o.id, text: texts[i] as string })),
      warning: 'the options carried no ids, they were matched by position',
    };
  }

  if (withId !== entries.length) {
    return { warning: 'some options carried an id and some did not, they were ignored' };
  }

  const storedByLower = new Map(stored.map((o) => [o.id.trim().toLowerCase(), o.id]));
  const seen = new Set<string>();
  for (const id of ids) {
    const match = storedByLower.get((id as string).toLowerCase());
    if (!match || seen.has(match)) {
      return { warning: 'the option ids do not match the stored ones, they were ignored' };
    }
    seen.add(match);
  }

  // Rebuilt in STORED order, so a reply that shuffled the rows cannot reorder
  // the options behind the answer key.
  const textById = new Map<string, string>();
  entries.forEach((_, i) => {
    const match = storedByLower.get((ids[i] as string).toLowerCase()) as string;
    textById.set(match, texts[i] as string);
  });
  return { value: stored.map((o) => ({ id: o.id, text: textById.get(o.id) as string })) };
}

function readText(value: unknown, cap: number): { value?: string | null; bad?: boolean } {
  if (value === null) return { value: null };
  if (typeof value !== 'string') return { bad: true };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  return { value: trimmed.slice(0, cap) };
}

/**
 * Validate a pasted AI reply. Accepts {"reviews":[...]} or a bare array.
 *
 * `known` is the chunk that was exported. An id outside it drops the row: the
 * server re-checks ids at commit anyway, but catching it here is what stops a
 * teacher applying a fix to a question they never looked at.
 */
export function validateQuestionReviewJSON(
  raw: string,
  known: Map<string, ReviewExportQuestion>,
): ReviewValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJSON(raw));
  } catch {
    return {
      rows: [],
      errors: ['Could not parse JSON. Paste the AI reply exactly, without extra commentary.'],
      warnings,
    };
  }

  let rawRows: unknown[];
  if (Array.isArray(parsed)) {
    rawRows = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as Record<string, unknown>).reviews)
  ) {
    rawRows = (parsed as { reviews: unknown[] }).reviews;
  } else {
    return {
      rows: [],
      errors: ['Expected {"reviews":[...]} or a bare array of rows.'],
      warnings,
    };
  }

  const seen = new Set<string>();
  const rows: QuestionReviewRow[] = [];

  rawRows.forEach((entry, index) => {
    const r = entry as Record<string, unknown>;
    const label = `Row ${index + 1}`;

    const qid = typeof r?.question_id === 'string' ? r.question_id.trim() : '';
    if (!qid || qid.length < 10) {
      errors.push(`${label}: missing or invalid question_id, row skipped.`);
      return;
    }
    if (known.size > 0 && !known.has(qid)) {
      errors.push(`${label}: question_id ${shortId(qid)} is not in the reviewed set, row skipped.`);
      return;
    }
    if (seen.has(qid)) {
      warnings.push(`${label}: duplicate question_id ${shortId(qid)}, kept the first one.`);
      return;
    }

    const verdictRaw = typeof r?.verdict === 'string' ? r.verdict.trim().toLowerCase() : '';
    const verdict = VERDICTS.find((v) => v === verdictRaw);
    if (!verdict) {
      errors.push(
        `${label}: unknown verdict ${verdictRaw ? `"${verdictRaw}"` : '(missing)'}, row skipped.`,
      );
      return;
    }

    const noteRead = readText(r?.note, MAX_NOTE_CHARS);
    const row: QuestionReviewRow = {
      question_id: qid,
      verdict,
      note: noteRead.value || '',
    };

    const present = (key: string) =>
      Object.prototype.hasOwnProperty.call(r, key) && r[key] !== undefined;
    const question = known.get(qid);

    if (present('question_text')) {
      const read = readText(r.question_text, MAX_TEXT_CHARS);
      if (read.bad || read.value === null) {
        // Blanking a question outright is never the fix the teacher wanted.
        warnings.push(`${label}: question_text was empty or not text, it was ignored.`);
      } else {
        row.question_text = read.value;
      }
    }

    if (present('explanation_brief')) {
      const read = readText(r.explanation_brief, MAX_TEXT_CHARS);
      if (read.bad) warnings.push(`${label}: explanation_brief was not text, it was ignored.`);
      else row.explanation_brief = read.value;
    }

    if (present('correct_answer') && question) {
      if (r.correct_answer === null) {
        warnings.push(`${label}: refused to clear the correct_answer, it was left alone.`);
      } else if (typeof r.correct_answer !== 'string') {
        warnings.push(`${label}: correct_answer was not text, it was ignored.`);
      } else {
        const resolved = resolveAnswer(r.correct_answer, question);
        if (resolved.warning) warnings.push(`${label}: ${resolved.warning}.`);
        if (resolved.value !== undefined) row.correct_answer = resolved.value;
      }
    }

    if (present('options') && question) {
      const resolved = resolveOptions(r.options, question);
      if (resolved.warning) warnings.push(`${label}: ${resolved.warning}.`);
      if (resolved.value) row.options = resolved.value;
    }

    seen.add(qid);
    rows.push(row);
  });

  return { rows, errors, warnings };
}

// ---------------------------------------------------------------------------
// The diff the review step renders, and the apply step sends
// ---------------------------------------------------------------------------

/** Options rendered as one readable line, for the before/after columns. */
function optionsLine(options: ReviewOption[] | null | undefined): string | null {
  if (!options || options.length === 0) return null;
  return options.map((o) => `${o.id}) ${o.text}`).join('  ');
}

function sameText(a: string | null, b: string | null): boolean {
  return (a || '').trim() === (b || '').trim();
}

/**
 * Which fields on this row would actually change the stored question.
 *
 * A model that echoes a field back unchanged is common, and showing the teacher
 * "explanation_brief: Old note. to Old note." teaches them to stop reading the
 * diff. Only real changes are listed.
 */
export function diffReviewRow(
  row: QuestionReviewRow,
  current: ReviewExportQuestion,
): ReviewFieldChange[] {
  const changes: ReviewFieldChange[] = [];

  if ('question_text' in row && !sameText(row.question_text ?? null, current.question_text)) {
    changes.push({
      field: 'question_text',
      before: current.question_text,
      after: row.question_text ?? null,
    });
  }

  if ('options' in row) {
    const before = optionsLine(current.options);
    const after = optionsLine(row.options);
    if (!sameText(before, after)) changes.push({ field: 'options', before, after });
  }

  if ('correct_answer' in row && !sameText(row.correct_answer ?? null, current.correct_answer)) {
    changes.push({
      field: 'correct_answer',
      before: current.correct_answer,
      after: row.correct_answer ?? null,
    });
  }

  if (
    'explanation_brief' in row &&
    !sameText(row.explanation_brief ?? null, current.explanation_brief ?? null)
  ) {
    changes.push({
      field: 'explanation_brief',
      before: current.explanation_brief ?? null,
      after: row.explanation_brief ?? null,
    });
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Recording a check
// ---------------------------------------------------------------------------

/** One verdict as the dialog sends it back, before any trust is extended. */
export interface ReviewVerdictInput {
  question_id: string;
  verdict: string;
  note?: string | null;
}

export interface ReviewRowInput {
  reviews: ReviewVerdictInput[];
  /** The questions the test is actually composed of. Anything else is dropped. */
  onThisTest: Set<string>;
  /** What was written per question, and the audit row it went through. */
  applied: Map<string, { fields: string[]; editId: string | null }>;
  /** The correct rate before any fix moved it. */
  snapshot: Map<string, { correct_pct: number | null; answered: number }>;
  testId: string;
  placementId: string | null;
  reviewedBy: string | null;
}

/** Shaped for recordQuestionReviews in @neram/database. */
export interface ReviewRecord {
  questionId: string;
  testId: string;
  placementId: string | null;
  verdict: ReviewVerdict;
  note: string | null;
  appliedFields: string[];
  editId: string | null;
  correctPctAtCheck: number | null;
  answeredAtCheck: number | null;
  reviewedBy: string | null;
}

/**
 * One history row per question the AI judged, fixed or not. PURE.
 *
 * "Checked, nothing wrong" is recorded on purpose: it is the fact that stops the
 * same question being sent to an AI a second time. A verdict outside the four
 * is dropped rather than guessed, a question off this test is dropped, and a
 * reply naming a question twice counts once, the first time.
 */
export function buildReviewRows(input: ReviewRowInput): ReviewRecord[] {
  const seen = new Set<string>();
  const out: ReviewRecord[] = [];
  for (const r of input.reviews || []) {
    const id = typeof r?.question_id === 'string' ? r.question_id : '';
    if (!id || seen.has(id) || !input.onThisTest.has(id)) continue;
    if (!VERDICTS.includes(r.verdict as ReviewVerdict)) continue;
    seen.add(id);

    const applied = input.applied.get(id);
    const snap = input.snapshot.get(id);
    const note = typeof r.note === 'string' ? r.note.trim().slice(0, MAX_NOTE_CHARS) : '';

    out.push({
      questionId: id,
      testId: input.testId,
      placementId: input.placementId,
      verdict: r.verdict as ReviewVerdict,
      note: note || null,
      appliedFields: applied?.fields ?? [],
      editId: applied?.editId ?? null,
      correctPctAtCheck: snap?.correct_pct ?? null,
      answeredAtCheck: snap ? snap.answered : null,
      reviewedBy: input.reviewedBy,
    });
  }
  return out;
}
