/**
 * The tutor pack: everything the AI Tutor teaches one question with, written
 * offline (scripts/qb-tutor-packs.ts) and checked against the stored answer
 * key before a student ever sees it.
 *
 * PURE: no `@/` imports, no Supabase, no React. The offline script imports
 * this file by relative path, and the maths check is passed in (`Matchers`)
 * so this file does not depend on @neram/database either.
 *
 * The pack never leaves the server. lib/assistant/tutor/engine.ts sends one
 * step at a time, choices without their `correct` flag.
 */

export const ERROR_CODES = [
  'CONCEPT_MISUNDERSTANDING',
  'PREREQUISITE_GAP',
  'FORMULA_RECALL',
  'FORMULA_SELECTION',
  'ALGEBRA_ERROR',
  'ARITHMETIC_ERROR',
  'SIGN_ERROR',
  'UNIT_ERROR',
  'DIRECTION_ERROR',
  'GRAPH_READING_ERROR',
  'QUESTION_INTERPRETATION',
  'REASONING_GAP',
  'CARELESS_ERROR',
  'GUESS',
  'INCOMPLETE_REASONING',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Slips: a wrong answer with one of these says little about understanding. */
export const SLIP_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['ARITHMETIC_ERROR', 'SIGN_ERROR', 'CARELESS_ERROR', 'UNIT_ERROR']);

/** Plain words for each code, for the student and the teacher view. No jargon codes on screen. */
export const ERROR_LABEL: Record<ErrorCode, string> = {
  CONCEPT_MISUNDERSTANDING: 'Idea not clear yet',
  PREREQUISITE_GAP: 'Missing groundwork',
  FORMULA_RECALL: 'Formula not remembered',
  FORMULA_SELECTION: 'Wrong formula picked',
  ALGEBRA_ERROR: 'Algebra slip',
  ARITHMETIC_ERROR: 'Calculation slip',
  SIGN_ERROR: 'Sign slip',
  UNIT_ERROR: 'Units slip',
  DIRECTION_ERROR: 'Direction mixed up',
  GRAPH_READING_ERROR: 'Graph misread',
  QUESTION_INTERPRETATION: 'Question misread',
  REASONING_GAP: 'A step in the reasoning missing',
  CARELESS_ERROR: 'Careless slip',
  GUESS: 'Guessed',
  INCOMPLETE_REASONING: 'Stopped too early',
};

export interface PackChoice {
  id: string;
  /** Markdown with $...$ maths (rendered by MathText). */
  md: string;
  correct: boolean;
  mistake?: ErrorCode;
  /** What to say when this wrong choice is picked. */
  feedback?: string;
}

export interface PackFormula {
  title: string;
  md: string;
}

export interface TutorStep {
  id: string;
  /** nexus_concepts.slug this step practises. */
  concept: string;
  /** The small piece of teaching before the check (one idea). */
  teach: string;
  /** The check question. */
  ask: string;
  answer_kind: 'choice' | 'number';
  choices?: PackChoice[];
  /** For number steps: a value parseMathAnswer can read. */
  expected?: string;
  tolerance?: number;
  /** A different way of explaining, for "why?" and for a second wrong try. */
  why: string;
  /** Said when the check is answered correctly. Names what was done well. */
  on_correct: string;
  /** What this step establishes, shown after it is answered (or given). */
  result_md: string;
  /** A formula this step uses, offered to save. */
  formula?: PackFormula;
  /** A later active-recall card (R2). */
  recall?: { ask: string; expected: string };
}

export interface PrereqCheck {
  concept: string;
  ask: string;
  choices: PackChoice[];
  /** A short reteach when the check is missed. */
  teach: string;
}

export interface PackMistake {
  code: ErrorCode;
  /** The wrong option a student picks in the reader, or the wrong value typed. */
  trigger: { option_id: string } | { value: string };
  /** Guided help starts at this step. */
  step_id: string;
  explain: string;
}

export interface TutorPack {
  v: 1;
  concepts: Array<{ slug: string; role: 'core' | 'uses' }>;
  prerequisites: PrereqCheck[];
  steps: TutorStep[];
  /** L1 nudge, L2 the idea, L3 the method, L4 the first substitution (never the final value). */
  hints: [string, string, string, string];
  mistakes: PackMistake[];
  final: { option_id?: string; value?: string; md: string; praise: string };
}

/** The question the pack is checked against: the fields its checksum covers. */
export interface PackQuestion {
  question_format: string;
  question_text: string | null;
  question_image_url?: string | null;
  options: Array<{ id?: string | null; text?: string | null; image_url?: string | null }> | null;
  correct_answer: string | null;
  answer_tolerance: number | null;
}

/** The maths check, passed in so this file stays pure. */
export interface Matchers {
  /** True when two values agree (parseMathAnswer + mathAnswersMatch). False when either does not parse. */
  valuesMatch(student: string, key: string, tolerance?: number | null): boolean;
}

export interface VerifyReport {
  ok: boolean;
  errors: string[];
  /** Advisory notes the offline script adds (never block serving). */
  warnings?: string[];
}

const MAX_STEPS = 8;
const MAX_PREREQS = 2;
const MAX_TEXT = 1200;

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Balanced `$` (ignoring `\$`) and balanced braces: KaTeX renders it, or shows raw text. */
export function mathBalanced(md: string): boolean {
  const dollars = (md.replace(/\\\$/g, '').match(/\$/g) || []).length;
  if (dollars % 2 !== 0) return false;
  let depth = 0;
  for (const ch of md.replace(/\\[{}]/g, '')) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** Every markdown string a pack would put on screen, with where it sits. */
function texts(pack: TutorPack): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  pack.prerequisites.forEach((p, i) => {
    out.push([`prerequisites[${i}].ask`, p.ask], [`prerequisites[${i}].teach`, p.teach]);
    p.choices.forEach((c, j) => {
      out.push([`prerequisites[${i}].choices[${j}]`, c.md]);
      if (c.feedback) out.push([`prerequisites[${i}].choices[${j}].feedback`, c.feedback]);
    });
  });
  pack.steps.forEach((s) => {
    out.push([`${s.id}.teach`, s.teach], [`${s.id}.ask`, s.ask], [`${s.id}.why`, s.why], [`${s.id}.on_correct`, s.on_correct], [`${s.id}.result_md`, s.result_md]);
    (s.choices || []).forEach((c, j) => {
      out.push([`${s.id}.choices[${j}]`, c.md]);
      if (c.feedback) out.push([`${s.id}.choices[${j}].feedback`, c.feedback]);
    });
    if (s.formula) out.push([`${s.id}.formula`, s.formula.md], [`${s.id}.formula.title`, s.formula.title]);
    if (s.recall) out.push([`${s.id}.recall.ask`, s.recall.ask], [`${s.id}.recall.expected`, s.recall.expected]);
  });
  pack.hints.forEach((h, i) => out.push([`hints[${i}]`, h]));
  pack.mistakes.forEach((m, i) => out.push([`mistakes[${i}].explain`, m.explain]));
  out.push(['final.md', pack.final.md], ['final.praise', pack.final.praise]);
  return out;
}

function checkChoices(where: string, choices: PackChoice[] | undefined, errors: string[]): void {
  if (!Array.isArray(choices) || choices.length < 2 || choices.length > 5) {
    errors.push(`${where}: needs 2 to 5 choices`);
    return;
  }
  const ids = new Set<string>();
  for (const c of choices) {
    if (!isStr(c?.id) || !isStr(c?.md)) errors.push(`${where}: a choice has no id or text`);
    else if (ids.has(c.id)) errors.push(`${where}: duplicate choice id ${c.id}`);
    else ids.add(c.id);
  }
  const correct = choices.filter((c) => c?.correct === true).length;
  if (correct !== 1) errors.push(`${where}: has ${correct} correct choices, needs exactly 1`);
}

/** The question's correct option id(s): `correct_answer` names one, or options carry is_correct. */
function correctOptionIds(q: PackQuestion): Set<string> {
  const ids = new Set<string>();
  const key = String(q.correct_answer ?? '').trim();
  if (key) for (const part of key.split(/[,\s]+/)) if (part) ids.add(part.toLowerCase());
  for (const o of q.options || []) if ((o as { is_correct?: boolean })?.is_correct && o?.id) ids.add(String(o.id).toLowerCase());
  return ids;
}

/**
 * Whether a pack may be served for this question. Shape, maths, and the rules
 * that keep the tutor honest: one correct choice per check, a final answer
 * that agrees with the stored key, a last hint that does not give it away.
 * `knownConcepts` is the set of nexus_concepts slugs (empty set skips that check).
 */
export function verifyPack(raw: unknown, q: PackQuestion, m: Matchers, knownConcepts: ReadonlySet<string>): VerifyReport {
  const errors: string[] = [];
  const pack = raw as TutorPack;
  if (!pack || typeof pack !== 'object' || pack.v !== 1) return { ok: false, errors: ['not a v1 pack'] };
  if (!Array.isArray(pack.concepts) || pack.concepts.length === 0) errors.push('concepts: empty');
  if (!Array.isArray(pack.prerequisites)) errors.push('prerequisites: missing');
  if (!Array.isArray(pack.steps) || pack.steps.length === 0) errors.push('steps: empty');
  if (!Array.isArray(pack.hints) || pack.hints.length !== 4 || !pack.hints.every(isStr)) errors.push('hints: needs exactly 4');
  if (!Array.isArray(pack.mistakes)) errors.push('mistakes: missing');
  if (!pack.final || !isStr(pack.final.md) || !isStr(pack.final.praise)) errors.push('final: needs md and praise');
  if (errors.length) return { ok: false, errors };

  if (pack.steps.length > MAX_STEPS) errors.push(`steps: more than ${MAX_STEPS}`);
  if (pack.prerequisites.length > MAX_PREREQS) errors.push(`prerequisites: more than ${MAX_PREREQS}`);

  const conceptSlugs = new Set<string>();
  for (const c of pack.concepts) {
    if (!isStr(c?.slug) || (c.role !== 'core' && c.role !== 'uses')) errors.push('concepts: bad entry');
    else conceptSlugs.add(c.slug);
  }
  if (!pack.concepts.some((c) => c.role === 'core')) errors.push('concepts: no core concept');
  const known = (slug: string) => knownConcepts.size === 0 || knownConcepts.has(slug);
  for (const slug of conceptSlugs) if (!known(slug)) errors.push(`concepts: unknown slug ${slug}`);

  pack.prerequisites.forEach((p, i) => {
    if (!isStr(p?.concept) || !isStr(p.ask) || !isStr(p.teach)) errors.push(`prerequisites[${i}]: needs concept, ask, teach`);
    else if (!known(p.concept)) errors.push(`prerequisites[${i}]: unknown slug ${p.concept}`);
    checkChoices(`prerequisites[${i}]`, p?.choices, errors);
  });

  const stepIds = new Set<string>();
  for (const s of pack.steps) {
    const where = `step ${s?.id ?? '?'}`;
    if (!isStr(s?.id) || stepIds.has(s.id)) { errors.push(`${where}: missing or duplicate id`); continue; }
    stepIds.add(s.id);
    for (const f of ['concept', 'teach', 'ask', 'why', 'on_correct', 'result_md'] as const) if (!isStr(s[f])) errors.push(`${where}: no ${f}`);
    if (isStr(s.concept) && !known(s.concept)) errors.push(`${where}: unknown slug ${s.concept}`);
    if (s.answer_kind === 'choice') checkChoices(where, s.choices, errors);
    else if (s.answer_kind === 'number') {
      if (!isStr(s.expected) || !m.valuesMatch(s.expected, s.expected, s.tolerance)) errors.push(`${where}: expected does not parse`);
    } else errors.push(`${where}: answer_kind must be choice or number`);
  }

  pack.mistakes.forEach((mk, i) => {
    if (!ERROR_CODES.includes(mk?.code)) errors.push(`mistakes[${i}]: unknown code`);
    if (!stepIds.has(mk?.step_id)) errors.push(`mistakes[${i}]: step ${mk?.step_id} does not exist`);
    if (!isStr(mk?.explain)) errors.push(`mistakes[${i}]: no explain`);
    const t = mk?.trigger as { option_id?: string; value?: string } | undefined;
    if (!t || (!isStr(t.option_id) && !isStr(t.value))) errors.push(`mistakes[${i}]: no trigger`);
    else if (isStr(t.option_id) && !(q.options || []).some((o) => String(o?.id).toLowerCase() === t.option_id!.toLowerCase())) {
      errors.push(`mistakes[${i}]: option ${t.option_id} is not an option of this question`);
    }
  });

  // The final answer must agree with the stored key.
  const key = String(q.correct_answer ?? '').trim();
  if (q.question_format === 'MCQ') {
    const want = correctOptionIds(q);
    const got = String(pack.final.option_id ?? '').toLowerCase();
    if (!got) errors.push('final: MCQ needs option_id');
    else if (!want.has(got)) errors.push(`final: option ${got} disagrees with the key`);
    for (const mk of pack.mistakes) {
      const opt = (mk.trigger as { option_id?: string }).option_id;
      if (opt && want.has(opt.toLowerCase())) errors.push(`mistakes: option ${opt} is the correct answer, not a mistake`);
    }
  } else if (q.question_format === 'NUMERICAL') {
    if (!isStr(pack.final.value)) errors.push('final: NUMERICAL needs value');
    else if (!key || !m.valuesMatch(pack.final.value, key, q.answer_tolerance)) errors.push(`final: ${pack.final.value} disagrees with the key`);
    if (!pack.steps.some((st) => st.answer_kind === 'number')) errors.push('steps: a NUMERICAL question needs at least one number step');
    for (const mk of pack.mistakes) {
      const v = (mk.trigger as { value?: string }).value;
      if (!isStr(v)) continue;
      if (!m.valuesMatch(v, v)) errors.push(`mistakes: trigger value ${v} does not parse`);
      else if (key && m.valuesMatch(v, key, q.answer_tolerance)) errors.push(`mistakes: trigger value ${v} is the correct answer, not a mistake`);
    }
    const lastNumber = [...pack.steps].reverse().find((s) => s.answer_kind === 'number');
    if (lastNumber?.expected && isStr(pack.final.value) && !m.valuesMatch(lastNumber.expected, pack.final.value, q.answer_tolerance)) {
      errors.push(`step ${lastNumber.id}: last number step does not reach the final answer`);
    }
  } else errors.push(`question format ${q.question_format} is not taught in this round`);

  // The last hint is the first substitution, never the answer.
  // A one-character value ("2") appears in honest working (x^2), so only longer values are checked.
  const finalValue = q.question_format === 'NUMERICAL' ? String(pack.final.value ?? '').trim() : '';
  if (finalValue.length >= 2) {
    const esc = finalValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Not inside a longer number (125, 0.125, 12.55), but a sentence's full stop is fine.
    if (new RegExp(`(?<!\\d|\\d\\.)${esc}(?!\\d|\\.\\d)`).test(pack.hints[3] ?? '')) errors.push('hints[3]: gives away the final value');
  }
  if (q.question_format === 'MCQ' && pack.final.option_id) {
    // Compared without $ and spaces, so a long option written with different spacing is still caught;
    // short options ("-1", "14") appear in honest working and are not checked.
    const flat = (t: string) => t.replace(/\$|\s+/g, '');
    const correctText = flat((q.options || []).find((o) => String(o?.id).toLowerCase() === pack.final.option_id!.toLowerCase())?.text ?? '');
    if (correctText.length >= 5 && flat(pack.hints[3] ?? '').includes(correctText)) errors.push('hints[3]: gives away the correct option');
  }

  for (const [where, md] of texts(pack)) {
    if (typeof md !== 'string') continue;
    if (md.length > MAX_TEXT) errors.push(`${where}: longer than ${MAX_TEXT} characters`);
    if (!mathBalanced(md)) errors.push(`${where}: unbalanced $ or braces`);
    if (/\u2014|--|&mdash;/.test(md)) errors.push(`${where}: has a dash the house style forbids`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * What a pack's checksum covers (the format, text, figure, options with
 * their images, key and tolerance). Any change to these retires the pack. Hashing
 * is done by the caller (node:crypto on the server and in the script).
 */
export function checksumSource(q: PackQuestion): string {
  const options = (q.options || []).map((o) => `${o?.id ?? ''}=${o?.text ?? ''}=${o?.image_url ?? ''}`).join('|');
  return [q.question_format, q.question_text ?? '', q.question_image_url ?? '', options, q.correct_answer ?? '', q.answer_tolerance ?? ''].join('␟');
}
