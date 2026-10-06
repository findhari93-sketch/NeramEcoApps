/**
 * Pure parts of scripts/qb-tutor-packs.ts: the export items, the subagent
 * prompt, checking each written pack against the stored answer key
 * (verifyPack) with its source checksum, gold scoring, the CSV row and the
 * version plan for a write. Only node:crypto, no DB, so it is unit tested on
 * its own (qb-tutor-pack.test.ts).
 *
 * The pack contract lives in apps/nexus/src/lib/assistant/tutor/pack.ts and
 * the maths reader in packages/database/src/queries/nexus/math-answer.ts. Both
 * are pure and imported by relative path, so the script and the app check
 * packs with exactly the same code.
 */

import { createHash } from 'node:crypto';
import {
  ERROR_CODES,
  ERROR_LABEL,
  checksumSource,
  verifyPack,
  type Matchers,
  type PackQuestion,
  type TutorPack,
} from '../../apps/nexus/src/lib/assistant/tutor/pack';
import { MCQ_PACK, MCQ_QUESTION, NUM_PACK, NUM_QUESTION } from '../../apps/nexus/src/lib/assistant/tutor/testing/fixtures';
import { mathAnswersMatch, parseMathAnswer } from '../../packages/database/src/queries/nexus/math-answer';

export interface PackSourceQuestion extends PackQuestion {
  id: string;
  difficulty: string | null;
  explanation_brief: string | null;
  explanation_detailed: string | null;
}

export interface ConceptOption {
  slug: string;
  label: string;
  chapter: string; // chapter tag slug
  summary: string | null;
}

export interface PackExportItem {
  question_id: string;
  format: string;
  question_text: string | null;
  options: Array<{ id?: string | null; text?: string | null }> | null;
  correct_answer: string | null;
  answer_tolerance: number | null;
  difficulty: string | null;
  primary_chapter: string | null;
  concepts: Array<{ slug: string; label: string; summary?: string }>;
  reference_working: { brief: string | null; detailed: string | null };
}

export type PackStatus = 'verified' | 'draft';

export interface PackOutcome {
  questionId: string;
  status: PackStatus;
  pack: unknown;
  verify_report: { ok: boolean; errors: string[]; warnings: string[] };
  source_checksum: string;
}

/** The question bank's maths reader, the same one the app's tutorMatchers wraps. */
export const scriptMatchers: Matchers = {
  valuesMatch(a, b, tol) {
    const x = parseMathAnswer(a);
    const y = parseMathAnswer(b);
    return !!(x && y && mathAnswersMatch(x, y, tol));
  },
};

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * Chapters whose concepts a pack may name: the primary chapter, the chapters
 * the question also uses, then every chapter its concepts' prerequisites reach.
 */
export function chaptersForQuestion(
  primary: string | null,
  alsoUses: string[],
  concepts: ConceptOption[],
  prereqs: Array<[string, string]>, // [concept slug, requires slug]
): string[] {
  const chapterOf = new Map(concepts.map((c) => [c.slug, c.chapter]));
  const out: string[] = [];
  const add = (ch: string | null | undefined) => {
    if (ch && !out.includes(ch)) out.push(ch);
  };
  add(primary);
  alsoUses.forEach(add);
  const requires = new Map<string, string[]>();
  for (const [a, b] of prereqs) requires.set(a, [...(requires.get(a) || []), b]);
  // Walk prerequisites from every concept in the chapters so far (breadth first).
  const seen = new Set<string>();
  const queue = concepts.filter((c) => out.includes(c.chapter)).map((c) => c.slug);
  while (queue.length) {
    const s = queue.shift()!;
    if (seen.has(s)) continue;
    seen.add(s);
    for (const r of requires.get(s) || []) {
      add(chapterOf.get(r));
      queue.push(r);
    }
  }
  return out;
}

export function buildPackExportItem(
  q: PackSourceQuestion,
  primary: string | null,
  alsoUses: string[],
  concepts: ConceptOption[],
  prereqs: Array<[string, string]>,
): PackExportItem {
  const chapters = chaptersForQuestion(primary, alsoUses, concepts, prereqs);
  const menu = chapters.flatMap((ch) =>
    concepts
      .filter((c) => c.chapter === ch)
      .map((c) => ({ slug: c.slug, label: c.label, ...(c.summary ? { summary: c.summary } : {}) })),
  );
  return {
    question_id: q.id,
    format: q.question_format,
    question_text: q.question_text,
    options: q.options ? q.options.map((o) => ({ id: o?.id ?? null, text: o?.text ?? null })) : null,
    correct_answer: q.correct_answer,
    answer_tolerance: q.answer_tolerance,
    difficulty: q.difficulty,
    primary_chapter: primary,
    concepts: menu,
    reference_working: {
      brief: q.explanation_brief?.trim() || null,
      detailed: q.explanation_detailed ? q.explanation_detailed.trim().slice(0, 4000) : null,
    },
  };
}

// ── Prompt ───────────────────────────────────────────────────────────────────

/** The fixture MCQ pack, completed so every wrong option has a mistake (as the prompt asks). */
function examplePacks(): Record<string, TutorPack> {
  const mcq: TutorPack = JSON.parse(JSON.stringify(MCQ_PACK));
  mcq.mistakes.push({
    code: 'FORMULA_SELECTION',
    trigger: { option_id: 'c' },
    step_id: 's1',
    explain: 'You got $1$, which comes from pairing $2$ with $-1$ and $3$ with $1$. Pair $\\hat i$ with $\\hat i$ and $\\hat j$ with $\\hat j$.',
  });
  return { '<mcq question id>': mcq, '<numerical question id>': NUM_PACK };
}

const codeLines = () => ERROR_CODES.map((c) => `- ${c}: ${ERROR_LABEL[c]}`).join('\n');

export function buildTutorSystemPrompt(): string {
  const ex = examplePacks();
  const exQ = (q: PackQuestion) =>
    [
      `${q.question_format}: ${q.question_text}`,
      ...(q.options || []).map((o) => `(${o.id}) ${o.text}`),
      `Key: ${q.correct_answer}`,
    ].join('\n');
  return `You are a patient, warm mathematics teacher in India who has prepared students for JEE Main Paper 2 (B.Arch) and NATA for many years. For each question bank question you are given, you write a TUTOR PACK: the material an AI tutor uses to teach that one question to a student, one small step at a time, on a phone.

The tutor is strict and deterministic. It never asks a model whether an answer is right: it compares the student's choice or number with what you write. So every check must have exactly one clearly right answer.

WHAT YOU GET PER QUESTION
format (MCQ or NUMERICAL), question_text, options (MCQ), correct_answer (the KEY: an option id for MCQ, a value for NUMERICAL), answer_tolerance, difficulty, primary_chapter, concepts (the only concept slugs you may use, with labels), and reference_working (the stored explanation: useful, but it may be short or have slips).
The KEY is authoritative. Solve the question yourself first. If your answer disagrees with the key, check again carefully. If you are still sure the key is wrong, do not write a pack for that question: add it to doubts (see REPLY FORMAT).

THE PACK
v: always 1.

concepts: 1 to 4 entries from the question's concept list, as {"slug", "role"}. The idea the question is about gets role "core" (at least one entry must be core); ideas needed on the way get "uses".

prerequisites: 0 to 2 quick checks of groundwork the question needs (usually a "uses" concept), each a choice question: {"concept", "ask", "choices", "teach"}. teach is a short reteach shown when the check is missed. Leave the list empty when the question needs no special groundwork.

steps: 2 to 6 steps, in solving order. Each step is ONE idea, never two:
- id: s1, s2, s3 ... in order.
- concept: a slug from the list.
- teach: 1 to 3 sentences of teaching before the check. Speak to the student ("you"). Build on what the previous step established.
- ask: the check question.
- answer_kind "choice": 3 or 4 choices {"id", "md", "correct"}, ids c1, c2, ... exactly one with "correct": true. Each wrong choice is a mistake a real student makes, with "mistake" (an error code) and "feedback" (one or two sentences saying what went wrong, kindly, without giving the right choice away).
- answer_kind "number": "expected" is the value, written plainly so a calculator-style reader can read it: digits, a decimal point, + - * / ^, brackets, \\sqrt{...}, \\frac{...}{...}, \\pi. No $ signs, no units, no ratios like 2:3, no variables, at most 40 characters. Use a number step only when the value is a single number; add "tolerance" only when rounding is genuinely expected.
- why: a DIFFERENT way of explaining the same idea, for when the student asks why or gets it wrong twice. Not a repeat of teach.
- on_correct: one sentence that names what the student just did right ("You kept the minus sign on $-1$"). Never just "Good" or "Correct".
- result_md: what this step establishes, as a short line of working.
- formula (optional): {"title", "md"} when the step uses a formula worth saving.
- recall (optional): {"ask", "expected"} a quick question for later revision, with a short answer.
For NUMERICAL questions the LAST number step must reach the final answer, and its expected must equal the key.

hints: exactly 4 strings, each a little more help than the last:
1. a nudge (what to look at, or what the question is really asking);
2. the idea (which concept or formula applies);
3. the method (the plan of the solution in one or two sentences);
4. the first substitution (the formula with the question's numbers put in). NEVER the final value and never the text of the correct option.

mistakes: what each likely wrong answer tells you. {"code", "trigger", "step_id", "explain"}.
- MCQ: one entry for EVERY wrong option, trigger {"option_id": "<id>"}. Work out which slip produces that option and say it in explain ("You got $5$, which comes from dropping the minus sign on $-1$"). If an option comes from no sensible working, use code GUESS and say so gently. Never list the correct option.
- NUMERICAL: 1 to 3 likely wrong values, trigger {"value": "<plain value>"}, e.g. a value from a sign slip or from stopping one step early.
- step_id: the step the guided help should restart from to fix that mistake.

final: MCQ: {"option_id": <the key>, "md", "praise"}. NUMERICAL: {"value": <the key, plainly written>, "md", "praise"}.
- md: the complete solution, concise, in the same order as the steps, ending with the answer.
- praise: specific to this question and naming what was done well, e.g. "You spotted that the angle sum fixes the third angle, then the sine rule did the rest". Never generic.

ERROR CODES (use exactly these)
${codeLines()}

WRITING RULES
- Maths in $...$ only (inline). No $$, no \\( \\). Balance every $ and every brace. Use LaTeX inside $...$ (\\frac, \\sqrt, \\vec, \\hat, \\theta, \\cdot).
- In JSON, every LaTeX backslash is written twice: "$\\\\frac{1}{2}$" in the file is $\\frac{1}{2}$ on screen.
- Plain, warm English for a Class 12 student in India. Short sentences. No slang, no emojis.
- Never use em dashes or double dashes anywhere, including in maths (write $-(-1)$, never two minus signs side by side). Use commas, colons or brackets instead.
- Every text at most 1200 characters; most are one or two sentences.
- Use only concept slugs from the question's list, exactly as written.

EXAMPLES
The two questions:
${exQ(MCQ_QUESTION)}

${exQ(NUM_QUESTION)}

Their packs, as they would appear in a results file:
BEGIN EXAMPLE
${JSON.stringify(ex, null, 2)}
END EXAMPLE`;
}

export function tutorOutputInstructions(): string {
  return `REPLY FORMAT
For each batch-NN.json (and batch-gold.json) in the folder, write results-NN.json (results-gold.json) next to it: ONE JSON object keyed by question id, each value a pack exactly as above, and nothing else in the file:
{"<question_id>": {"v": 1, "concepts": [...], "prerequisites": [...], "steps": [...], "hints": ["...", "...", "...", "..."], "mistakes": [...], "final": {...}}}
Questions you are sure have a wrong key go in doubts-NN.json instead: [{"question_id": "...", "reason": "one sentence"}]. Do not skip a question for any other reason.`;
}

// ── Results ──────────────────────────────────────────────────────────────────

/** Results files hold an object keyed by question id, or an array of {question_id, pack}. */
export function collectPackResults(files: unknown[]): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const f of files) {
    if (Array.isArray(f)) {
      for (const r of f) if (r && typeof r === 'object' && typeof r.question_id === 'string') out.set(r.question_id, r.pack);
    } else if (f && typeof f === 'object') {
      for (const [id, pack] of Object.entries(f as Record<string, unknown>)) out.set(id, pack);
    }
  }
  return out;
}

/** Soft checks the prompt asks for but serving does not depend on. */
function packWarnings(raw: unknown, q: PackQuestion, m: Matchers): string[] {
  const pack = raw as TutorPack;
  if (!pack || typeof pack !== 'object' || !Array.isArray(pack.mistakes)) return [];
  const warnings: string[] = [];
  if (q.question_format === 'MCQ') {
    const key = new Set(String(q.correct_answer ?? '').toLowerCase().split(/[,\s]+/).filter(Boolean));
    const covered = new Set(
      pack.mistakes.map((m) => String((m?.trigger as { option_id?: string })?.option_id ?? '').toLowerCase()).filter(Boolean),
    );
    for (const o of q.options || []) {
      const id = String(o?.id ?? '').toLowerCase();
      if (id && !key.has(id) && !covered.has(id)) warnings.push(`mistakes: wrong option ${id} has no mistake`);
    }
  }
  if (Array.isArray(pack.steps) && (pack.steps.length < 2 || pack.steps.length > 6)) warnings.push(`steps: ${pack.steps.length}, the target is 2 to 6`);
  return warnings;
}

function valueTriggers(pack: TutorPack): string[] {
  return (Array.isArray(pack?.mistakes) ? pack.mistakes : [])
    .map((mk) => (mk?.trigger as { value?: unknown } | undefined)?.value)
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

/** verifyPack plus the checksum: 'verified' packs may serve, 'draft' packs never do. */
export function checkPackResult(
  questionId: string,
  raw: unknown,
  q: PackQuestion,
  knownConcepts: ReadonlySet<string>,
  matchers: Matchers = scriptMatchers,
): PackOutcome {
  let report: { ok: boolean; errors: string[] };
  try {
    report = verifyPack(raw, q, matchers, knownConcepts);
  } catch (err) {
    report = { ok: false, errors: [`could not check: ${err instanceof Error ? err.message : String(err)}`] };
  }
  // Numerical trigger checks (unreadable, or equal to the key) now live in verifyPack itself.
  const errors = report.errors;
  const ok = errors.length === 0;
  return {
    questionId,
    status: ok ? 'verified' : 'draft',
    pack: raw ?? null,
    verify_report: { ok, errors, warnings: packWarnings(raw, q, matchers) },
    source_checksum: sha256Hex(checksumSource(q)),
  };
}

// ── Gold ─────────────────────────────────────────────────────────────────────

export interface TutorGoldItem {
  question_id: string;
  /** The option id (MCQ) or value (NUMERICAL) the founder checked by hand. */
  expect_final?: string;
  note?: string;
}

/**
 * A gold question counts when its pack verifies and, when the founder gave
 * expect_final, the pack's final answer is that one.
 */
export function scoreTutorGold(
  gold: TutorGoldItem[],
  outcomes: Map<string, PackOutcome>,
  matchers: Matchers = scriptMatchers,
): { correct: number; total: number; score: number; misses: Array<{ id: string; why: string }> } {
  let correct = 0;
  const misses: Array<{ id: string; why: string }> = [];
  for (const g of gold) {
    const o = outcomes.get(g.question_id);
    if (!o) {
      misses.push({ id: g.question_id, why: 'no result' });
      continue;
    }
    if (o.status !== 'verified') {
      misses.push({ id: g.question_id, why: `did not verify: ${o.verify_report.errors[0] ?? 'unknown'}` });
      continue;
    }
    const want = String(g.expect_final ?? '').trim();
    if (want) {
      const final = (o.pack as TutorPack).final;
      const ok = final.option_id
        ? final.option_id.toLowerCase() === want.toLowerCase()
        : !!final.value && matchers.valuesMatch(final.value, want, null);
      if (!ok) {
        misses.push({ id: g.question_id, why: `final ${final.option_id ?? final.value} is not the expected ${want}` });
        continue;
      }
    }
    correct += 1;
  }
  const total = gold.length;
  return { correct, total, score: total ? correct / total : 0, misses };
}

// ── Report ───────────────────────────────────────────────────────────────────

export const PACK_REPORT_HEADER = ['question_id', 'format', 'status', 'error_count', 'first_error', 'step_count', 'warnings', 'question'];

export function packReportRow(o: PackOutcome, format: string, questionText: string | null): unknown[] {
  const steps = Array.isArray((o.pack as TutorPack | null)?.steps) ? (o.pack as TutorPack).steps.length : 0;
  return [
    o.questionId,
    format,
    o.status,
    o.verify_report.errors.length,
    o.verify_report.errors[0] ?? '',
    steps,
    o.verify_report.warnings.join(' | '),
    (questionText || '').replace(/\s+/g, ' ').slice(0, 160),
  ];
}

// ── Write plan ───────────────────────────────────────────────────────────────

export interface ExistingPackRow {
  id: string;
  version: number;
  status: string;
  source_checksum: string;
}

/**
 * What --apply does for one question: insert a new version (max + 1); a
 * verified pack first retires the live one (verified or reviewed). A pack a
 * teacher reviewed for the question as it stands now is never replaced.
 */
export function planPackWrite(
  status: PackStatus,
  checksum: string,
  existing: ExistingPackRow[],
): { action: 'insert'; version: number; retire: string[] } | { action: 'skip'; reason: string } {
  const live = existing.filter((r) => r.status === 'verified' || r.status === 'reviewed');
  if (status === 'verified' && live.some((r) => r.status === 'reviewed' && r.source_checksum === checksum)) {
    return { action: 'skip', reason: 'a teacher-reviewed pack is live for this question' };
  }
  const version = existing.reduce((m, r) => Math.max(m, r.version), 0) + 1;
  return { action: 'insert', version, retire: status === 'verified' ? live.map((r) => r.id) : [] };
}
